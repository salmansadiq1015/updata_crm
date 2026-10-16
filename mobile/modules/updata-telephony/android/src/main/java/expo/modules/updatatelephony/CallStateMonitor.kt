package expo.modules.updatatelephony

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.util.Log
import androidx.annotation.MainThread
import androidx.annotation.RequiresApi

/**
 * Process-wide call-state observer bound to the APPLICATION context (not an Activity), so it
 * keeps receiving callbacks while the app is backgrounded behind the system dialer and across
 * JS reloads. It does NOT survive process death (no foreground service by design); events
 * persisted up to that point remain in [CallEventStore].
 *
 * Every callback is recorded, including the immediate one Android delivers on registration
 * (the current state). JS correlates the sequence; nothing here infers "answered".
 */
internal object CallStateMonitor {
  private const val TAG = "UpdataTelephony"

  /** A persisted active operation older than this is not resumed after a process restart. */
  private const val RESUME_WINDOW_MS = 6L * 60 * 60 * 1000

  private var store: CallEventStore? = null
  private var telephonyManager: TelephonyManager? = null
  private var activeOperationId: String? = null
  private var callback: Any? = null // TelephonyCallback (31+) or PhoneStateListener

  /** Set by the live module instance; receives each recorded event for JS emission. */
  @Volatile
  var emitter: ((CallStateRecord) -> Unit)? = null

  @Synchronized
  fun store(context: Context): CallEventStore =
    store ?: CallEventStore(context.applicationContext).also { store = it }

  fun hasReadPhoneState(context: Context): Boolean =
    context.checkSelfPermission(Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED

  /** Starts observing for [operationId]; stops any previous operation first. */
  @MainThread
  @Synchronized
  fun start(context: Context, operationId: String): Boolean {
    val app = context.applicationContext
    stopInternal(app, clearPersisted = true)
    if (!hasReadPhoneState(app)) return false
    if (!app.packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY)) return false
    val tm = app.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager ?: return false

    activeOperationId = operationId
    telephonyManager = tm
    store(app).setActive(operationId, System.currentTimeMillis())
    return try {
      callback = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        registerTelephonyCallback(app, tm, operationId)
      } else {
        registerPhoneStateListener(app, tm, operationId)
      }
      true
    } catch (e: SecurityException) {
      Log.w(TAG, "Call-state registration refused: ${e.javaClass.simpleName}")
      activeOperationId = null
      telephonyManager = null
      callback = null
      store(app).setActive(null, 0L)
      false
    }
  }

  @MainThread
  @Synchronized
  fun stop(context: Context) {
    stopInternal(context.applicationContext, clearPersisted = true)
  }

  /**
   * After a process restart (JS boots again while a call operation was being monitored),
   * re-attach the observer so the operation can still be ended explicitly and the current
   * state (usually `idle` = call over) gets recorded. Stale operations are dropped.
   */
  @MainThread
  @Synchronized
  fun resumeIfNeeded(context: Context) {
    if (activeOperationId != null) return
    val app = context.applicationContext
    val (op, startedAt) = store(app).activeOperation() ?: return
    if (System.currentTimeMillis() - startedAt > RESUME_WINDOW_MS) {
      store(app).setActive(null, 0L)
      return
    }
    start(app, op)
  }

  private fun stopInternal(app: Context, clearPersisted: Boolean) {
    val tm = telephonyManager
    val cb = callback
    if (tm != null && cb != null) {
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && cb is TelephonyCallback) {
          tm.unregisterTelephonyCallback(cb)
        } else if (cb is PhoneStateListener) {
          @Suppress("DEPRECATION")
          tm.listen(cb, PhoneStateListener.LISTEN_NONE)
        }
      } catch (e: Exception) {
        Log.w(TAG, "Call-state unregistration failed: ${e.javaClass.simpleName}")
      }
    }
    callback = null
    telephonyManager = null
    activeOperationId = null
    if (clearPersisted) store(app).setActive(null, 0L)
  }

  private fun record(app: Context, operationId: String, rawState: Int, source: String) {
    // Drop late callbacks from a listener that has since been replaced.
    if (operationId != activeOperationId) return
    val state = TelephonyMappers.callState(rawState) ?: return
    val event = CallStateRecord(operationId, state, System.currentTimeMillis(), source)
    try {
      store(app).append(event)
    } catch (e: Exception) {
      Log.w(TAG, "Failed to persist call-state event: ${e.javaClass.simpleName}")
    }
    try {
      emitter?.invoke(event)
    } catch (e: Exception) {
      Log.w(TAG, "Failed to emit call-state event: ${e.javaClass.simpleName}")
    }
  }

  @RequiresApi(Build.VERSION_CODES.S)
  private fun registerTelephonyCallback(app: Context, tm: TelephonyManager, operationId: String): TelephonyCallback {
    val cb = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
      override fun onCallStateChanged(state: Int) {
        record(app, operationId, state, "telephony_callback")
      }
    }
    tm.registerTelephonyCallback(app.mainExecutor, cb)
    return cb
  }

  @Suppress("DEPRECATION")
  private fun registerPhoneStateListener(app: Context, tm: TelephonyManager, operationId: String): PhoneStateListener {
    // Must be constructed on a Looper thread (callers run on the main thread).
    val listener = object : PhoneStateListener() {
      @Deprecated("Deprecated in Java")
      override fun onCallStateChanged(state: Int, phoneNumber: String?) {
        // phoneNumber is deliberately ignored (and is empty without READ_CALL_LOG anyway).
        record(app, operationId, state, "phone_state_listener")
      }
    }
    tm.listen(listener, PhoneStateListener.LISTEN_CALL_STATE)
    return listener
  }
}
