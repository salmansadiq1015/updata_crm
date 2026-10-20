package expo.modules.updatatelephony

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.telephony.SmsManager
import android.util.Log

/**
 * Sends one CRM-leased message with SmsManager on the chosen SIM.
 *
 * At-most-once: the journal entry is written BEFORE SmsManager is called, and a
 * message id that already has a journal entry is never sent again. Per-part
 * SENT/DELIVERED PendingIntents (explicit, unique data URI per part) report back
 * to SmsResultReceiver, which aggregates the final status into the journal.
 */
internal object SmsSender {
  const val ACTION_SENT = "expo.modules.updatatelephony.SMS_SENT"
  const val ACTION_DELIVERED = "expo.modules.updatatelephony.SMS_DELIVERED"
  const val EXTRA_MESSAGE_ID = "messageId"
  const val EXTRA_PART = "part"
  private const val TAG = "UpdataSms"

  fun permissionDeclared(ctx: Context, permission: String): Boolean = try {
    val info = if (Build.VERSION.SDK_INT >= 33) {
      ctx.packageManager.getPackageInfo(ctx.packageName, PackageManager.PackageInfoFlags.of(PackageManager.GET_PERMISSIONS.toLong()))
    } else {
      @Suppress("DEPRECATION")
      ctx.packageManager.getPackageInfo(ctx.packageName, PackageManager.GET_PERMISSIONS)
    }
    info.requestedPermissions?.contains(permission) == true
  } catch (e: Exception) {
    false
  }

  private fun smsManager(ctx: Context, subscriptionId: Int?): SmsManager {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val base = ctx.getSystemService(SmsManager::class.java)
        ?: throw TelephonyException("NO_TELEPHONY", "SmsManager unavailable")
      if (subscriptionId != null) base.createForSubscriptionId(subscriptionId) else base
    } else {
      @Suppress("DEPRECATION")
      if (subscriptionId != null) SmsManager.getSmsManagerForSubscriptionId(subscriptionId) else SmsManager.getDefault()
    }
  }

  private fun pending(ctx: Context, action: String, messageId: String, part: Int): PendingIntent {
    val intent = Intent(action)
      .setClass(ctx, SmsResultReceiver::class.java)
      .setData(Uri.parse("updata-sms://$action/$messageId/$part"))
      .putExtra(EXTRA_MESSAGE_ID, messageId)
      .putExtra(EXTRA_PART, part)
    // Mutable: the platform adds the delivery PDU / error extras. Safe — the intent is explicit.
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
    return PendingIntent.getBroadcast(ctx, (messageId.hashCode() * 31 + part) and 0x7fffffff, intent, flags)
  }

  /** @return number of parts handed to the modem. */
  fun send(ctx: Context, messageId: String, to: String, body: String, subscriptionId: Int?): Int {
    if (!permissionDeclared(ctx, Manifest.permission.SEND_SMS)) {
      throw TelephonyException("SMS_NOT_SUPPORTED", "This build cannot send SMS (Play build)")
    }
    if (ctx.checkSelfPermission(Manifest.permission.SEND_SMS) != PackageManager.PERMISSION_GRANTED) {
      throw TelephonyException("PERMISSION_DENIED", "SEND_SMS not granted")
    }
    if (!ctx.packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY)) {
      throw TelephonyException("NO_TELEPHONY", "Device has no telephony")
    }
    val number = TelephonyMappers.sanitizeDialable(to) ?: throw TelephonyException("INVALID_NUMBER", "Not a valid number")
    if (body.isBlank()) throw TelephonyException("INVALID_ARGUMENT", "Empty message")

    val store = SmsStore.get(ctx)
    if (store.journalHas(messageId)) {
      throw TelephonyException("ALREADY_ATTEMPTED", "This message was already handed to the modem")
    }
    val manager = smsManager(ctx, subscriptionId)
    val parts = manager.divideMessage(body)
    val now = System.currentTimeMillis()
    store.journalStart(messageId, parts.size, now) // point of no return — persisted first

    try {
      Log.i(TAG, "send op=$messageId to=${TelephonyMappers.redact(number)} parts=${parts.size} sub=${subscriptionId ?: "default"}")
      if (parts.size == 1) {
        manager.sendTextMessage(number, null, parts[0], pending(ctx, ACTION_SENT, messageId, 0), pending(ctx, ACTION_DELIVERED, messageId, 0))
      } else {
        val sent = ArrayList((0 until parts.size).map { pending(ctx, ACTION_SENT, messageId, it) })
        val delivered = ArrayList((0 until parts.size).map { pending(ctx, ACTION_DELIVERED, messageId, it) })
        manager.sendMultipartTextMessage(number, null, parts, sent, delivered)
      }
    } catch (e: Exception) {
      // Thrown synchronously before anything was queued: definite failure, safe to retry.
      store.journalFail(messageId, "SEND_REJECTED_${e.javaClass.simpleName}", System.currentTimeMillis())
      SmsEvents.emit(SmsEvents.STATUS, mapOf("messageId" to messageId, "status" to "failed", "errorCode" to "SEND_REJECTED"))
      throw TelephonyException("SMS_SEND_FAILED", "SmsManager rejected the message", e)
    }
    return parts.size
  }
}
