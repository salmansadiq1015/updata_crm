package expo.modules.updatatelephony

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.role.RoleManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.telephony.PhoneNumberUtils
import android.telephony.SubscriptionInfo
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import android.util.Log
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.util.Locale

/** Mirrors the JS `PlaceCallRequest`. */
class PlaceCallRequest : Record {
  @Field
  val number: String = ""

  @Field
  val subscriptionId: Int? = null

  @Field
  val operationId: String = ""
}

/** Rejection whose `code` is one of the JS `TelephonyErrorCode` strings. */
internal class TelephonyException(code: String, message: String, cause: Throwable? = null) :
  CodedException(code, message, cause)

/**
 * Android telephony bridge. Contract: modules/updata-telephony/src/UpdataTelephony.types.ts.
 *
 * - Never places a call except from an explicit JS `placeCall` request.
 * - Never sends SMS (only opens the system composer).
 * - Never logs full phone numbers (at most the last two digits).
 */
class UpdataTelephonyModule : Module() {
  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("UpdataTelephony")

    Events(EVENT_CALL_STATE)

    OnCreate {
      CallStateMonitor.emitter = { event -> sendEvent(EVENT_CALL_STATE, event.toMap()) }
      // Re-attach monitoring for an operation that was active when the process died.
      appContext.reactContext?.let { ctx ->
        android.os.Handler(android.os.Looper.getMainLooper()).post {
          try {
            CallStateMonitor.resumeIfNeeded(ctx)
          } catch (e: Exception) {
            Log.w(TAG, "Resume of call-state monitoring failed: ${e.javaClass.simpleName}")
          }
        }
      }
    }

    OnDestroy {
      // The observer itself is process-wide and keeps recording (persisted); only JS
      // emission is detached from this (dying) module instance.
      CallStateMonitor.emitter = null
    }

    AsyncFunction("getCapabilities") {
      capabilities(context)
    }

    AsyncFunction("getActiveSims") {
      activeSims(context)
    }

    AsyncFunction("normalizeNumber") { number: String, countryIso: String ->
      if (number.isBlank() || countryIso.isBlank()) return@AsyncFunction null
      PhoneNumberUtils.formatNumberToE164(number.trim(), countryIso.trim().uppercase(Locale.ROOT))
    }

    AsyncFunction("placeCall") { request: PlaceCallRequest ->
      placeCall(context, request)
    }

    AsyncFunction("openSmsComposer") { number: String, body: String ->
      val sanitized = TelephonyMappers.sanitizeDialable(number)
        ?: throw TelephonyException("INVALID_NUMBER", "Not a dialable number")
      val intent = Intent(Intent.ACTION_SENDTO, Uri.fromParts("smsto", sanitized, null))
        .putExtra("sms_body", body)
      startActivitySafely(intent)
    }

    AsyncFunction("startCallStateMonitoring") { operationId: String ->
      if (operationId.isBlank()) return@AsyncFunction false
      CallStateMonitor.start(context, operationId)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stopCallStateMonitoring") {
      CallStateMonitor.stop(context)
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("getCallStateEvents") { operationId: String ->
      CallStateMonitor.store(context).eventsFor(operationId).map { it.toMap() }
    }

    AsyncFunction("clearCallStateEvents") { operationId: String ->
      CallStateMonitor.store(context).clear(operationId)
    }
  }

  // ---------------------------------------------------------------------------------------
  // Capabilities

  private fun granted(ctx: Context, permission: String) =
    ctx.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

  private fun hasTelephony(ctx: Context) =
    ctx.packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY)

  @Suppress("DEPRECATION")
  private fun resolves(ctx: Context, intent: Intent): Boolean =
    ctx.packageManager.resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY) != null

  private fun dialIntent(number: String) =
    Intent(Intent.ACTION_DIAL, Uri.fromParts("tel", number, null))

  private fun capabilities(ctx: Context): Map<String, Any?> {
    val tm = ctx.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
    val telephony = hasTelephony(ctx)
    val simState = if (telephony && tm != null) TelephonyMappers.simState(tm.simState) else "unknown"
    val airplane = Settings.Global.getInt(ctx.contentResolver, Settings.Global.AIRPLANE_MODE_ON, 0) != 0
    return mapOf(
      "hasTelephony" to telephony,
      "sdkInt" to Build.VERSION.SDK_INT,
      "simState" to simState,
      "airplaneMode" to airplane,
      "callPhoneGranted" to granted(ctx, Manifest.permission.CALL_PHONE),
      "readPhoneStateGranted" to granted(ctx, Manifest.permission.READ_PHONE_STATE),
      "dialerAvailable" to resolves(ctx, Intent(Intent.ACTION_DIAL, Uri.parse("tel:"))),
      "smsComposerAvailable" to resolves(ctx, Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:"))),
      "isDefaultDialer" to isDefaultDialer(ctx),
      "directSmsSupported" to false
    )
  }

  private fun isDefaultDialer(ctx: Context): Boolean = try {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      val rm = ctx.getSystemService(RoleManager::class.java)
      rm != null && rm.isRoleAvailable(RoleManager.ROLE_DIALER) && rm.isRoleHeld(RoleManager.ROLE_DIALER)
    } else {
      val telecom = ctx.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
      telecom?.defaultDialerPackage == ctx.packageName
    }
  } catch (e: Exception) {
    false
  }

  // ---------------------------------------------------------------------------------------
  // SIMs

  @SuppressLint("MissingPermission")
  private fun activeSims(ctx: Context): List<Map<String, Any?>> {
    if (!granted(ctx, Manifest.permission.READ_PHONE_STATE)) {
      throw TelephonyException("PERMISSION_DENIED", "READ_PHONE_STATE not granted")
    }
    if (!hasTelephony(ctx)) return emptyList()
    val sm = ctx.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
      ?: return emptyList()
    val infos: List<SubscriptionInfo> = try {
      sm.activeSubscriptionInfoList ?: emptyList()
    } catch (e: SecurityException) {
      throw TelephonyException("PERMISSION_DENIED", "Subscription list refused", e)
    }
    val defaultVoice = SubscriptionManager.getDefaultVoiceSubscriptionId()
    val defaultSms = SubscriptionManager.getDefaultSmsSubscriptionId()
    return infos.map { info ->
      mapOf(
        "subscriptionId" to info.subscriptionId,
        "slotIndex" to (info.simSlotIndex.takeIf { it >= 0 } ?: -1),
        "carrierName" to info.carrierName?.toString()?.takeIf { it.isNotBlank() },
        "displayName" to info.displayName?.toString()?.takeIf { it.isNotBlank() },
        "countryIso" to info.countryIso?.takeIf { it.isNotBlank() },
        "isEmbedded" to (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && info.isEmbedded),
        "isDefaultVoice" to (info.subscriptionId == defaultVoice),
        "isDefaultSms" to (info.subscriptionId == defaultSms),
        "number" to simNumber(info)
      )
    }
  }

  /**
   * READ_PHONE_NUMBERS is intentionally not declared, so SubscriptionManager.getPhoneNumber
   * (API 33+) is not used. The deprecated field is returned when the platform exposes it.
   */
  @Suppress("DEPRECATION")
  private fun simNumber(info: SubscriptionInfo): String? = try {
    info.number?.takeIf { it.isNotBlank() }
  } catch (e: SecurityException) {
    null
  }

  // ---------------------------------------------------------------------------------------
  // Calling

  @SuppressLint("MissingPermission")
  private fun placeCall(ctx: Context, request: PlaceCallRequest): Map<String, Any?> {
    val number = TelephonyMappers.sanitizeDialable(request.number)
      ?: throw TelephonyException("INVALID_NUMBER", "Not a dialable number")
    val requestedSub = request.subscriptionId
    val telecom = ctx.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager
    val canDirect = granted(ctx, Manifest.permission.CALL_PHONE) && hasTelephony(ctx) && telecom != null

    if (requestedSub != null && !hasTelephony(ctx)) {
      throw TelephonyException("NO_TELEPHONY", "Device has no telephony; cannot use the requested SIM")
    }

    if (canDirect && telecom != null) {
      val extras = Bundle()
      if (requestedSub != null) {
        val handle = findPhoneAccount(ctx, telecom, requestedSub)
        extras.putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, handle)
      }
      try {
        Log.i(TAG, "placeCall telecom_direct op=${request.operationId} to=${TelephonyMappers.redact(number)} sub=${requestedSub ?: "default"}")
        telecom.placeCall(Uri.fromParts("tel", number, null), extras)
      } catch (e: SecurityException) {
        throw TelephonyException("CALL_FAILED", "Telecom refused the call", e)
      } catch (e: Exception) {
        throw TelephonyException("CALL_FAILED", "Telecom could not place the call", e)
      }
      return mapOf("route" to "telecom_direct", "subscriptionApplied" to (requestedSub != null))
    }

    Log.i(TAG, "placeCall dialer_handoff op=${request.operationId} to=${TelephonyMappers.redact(number)}")
    if (!startActivitySafely(dialIntent(number))) {
      throw TelephonyException("NO_ACTIVITY", "No dialer app available")
    }
    return mapOf("route" to "dialer_handoff", "subscriptionApplied" to false)
  }

  /** Finds the Telecom account for [subscriptionId]; never substitutes a different SIM. */
  @SuppressLint("MissingPermission")
  private fun findPhoneAccount(ctx: Context, telecom: TelecomManager, subscriptionId: Int): PhoneAccountHandle {
    if (!granted(ctx, Manifest.permission.READ_PHONE_STATE)) {
      throw TelephonyException("PERMISSION_DENIED", "READ_PHONE_STATE is required to select a SIM")
    }
    val handles: List<PhoneAccountHandle> = try {
      telecom.callCapablePhoneAccounts ?: emptyList()
    } catch (e: SecurityException) {
      throw TelephonyException("PERMISSION_DENIED", "Phone accounts refused", e)
    }
    val tm = ctx.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
    val match = handles.firstOrNull { handle ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && tm != null) {
        try {
          tm.getSubscriptionId(handle) == subscriptionId
        } catch (e: Exception) {
          false
        }
      } else {
        // Pre-30 AOSP telephony accounts use the subscription id (or ICCID on very old builds)
        // as the handle id.
        handle.id == subscriptionId.toString() || handle.id == legacyIccId(ctx, subscriptionId)
      }
    }
    return match ?: throw TelephonyException("SUBSCRIPTION_NOT_FOUND", "No call-capable account for that SIM")
  }

  @SuppressLint("MissingPermission")
  private fun legacyIccId(ctx: Context, subscriptionId: Int): String? = try {
    val sm = ctx.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
    sm?.getActiveSubscriptionInfo(subscriptionId)?.iccId?.takeIf { it.isNotBlank() }
  } catch (e: Exception) {
    null
  }

  /** Starts [intent] from the current Activity when present, else as a new task. */
  private fun startActivitySafely(intent: Intent): Boolean {
    val activity: Activity? = appContext.currentActivity
    val ctx = context
    if (!resolves(ctx, intent)) return false
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return try {
      // Prefer the foreground Activity: starting from the application context while the app
      // is in the background is blocked on API 29+.
      if (activity != null) activity.startActivity(intent) else ctx.startActivity(intent)
      true
    } catch (e: ActivityNotFoundException) {
      false
    } catch (e: SecurityException) {
      false
    }
  }

  companion object {
    private const val TAG = "UpdataTelephony"
    private const val EVENT_CALL_STATE = "onCallStateChanged"
  }
}
