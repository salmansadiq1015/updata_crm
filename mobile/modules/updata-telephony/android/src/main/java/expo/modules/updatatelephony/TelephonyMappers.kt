package expo.modules.updatatelephony

import android.telephony.TelephonyManager

/**
 * Pure mapping/validation helpers. No Android runtime calls (only compile-time constants),
 * so they run in JVM unit tests.
 */
internal object TelephonyMappers {
  fun simState(state: Int): String = when (state) {
    TelephonyManager.SIM_STATE_READY -> "ready"
    TelephonyManager.SIM_STATE_ABSENT -> "absent"
    TelephonyManager.SIM_STATE_PIN_REQUIRED,
    TelephonyManager.SIM_STATE_PUK_REQUIRED,
    TelephonyManager.SIM_STATE_NETWORK_LOCKED,
    TelephonyManager.SIM_STATE_PERM_DISABLED -> "locked"
    TelephonyManager.SIM_STATE_NOT_READY,
    TelephonyManager.SIM_STATE_CARD_IO_ERROR,
    TelephonyManager.SIM_STATE_CARD_RESTRICTED -> "not_ready"
    else -> "unknown"
  }

  /** Returns null for states outside the contract (never happens on AOSP). */
  fun callState(state: Int): String? = when (state) {
    TelephonyManager.CALL_STATE_IDLE -> "idle"
    TelephonyManager.CALL_STATE_RINGING -> "ringing"
    TelephonyManager.CALL_STATE_OFFHOOK -> "offhook"
    else -> null
  }

  private val SEPARATORS = Regex("[\\s\\-().]")
  private val DIALABLE = Regex("^\\+?[0-9]{3,20}$")

  /**
   * Strips common visual separators and validates a dialable number: optional leading '+',
   * then 3–20 digits. Returns null when invalid. '*', '#', ',' and letters are rejected on
   * purpose: this app dials CRM contacts, not USSD/MMI codes.
   */
  fun sanitizeDialable(raw: String?): String? {
    if (raw == null) return null
    val cleaned = raw.trim().replace(SEPARATORS, "")
    return if (DIALABLE.matches(cleaned)) cleaned else null
  }

  /** Log-safe form of a phone number: at most the last two digits. */
  fun redact(number: String?): String {
    if (number.isNullOrEmpty()) return "<empty>"
    val digits = number.filter { it.isDigit() }
    return if (digits.length <= 2) "**" else "…" + digits.takeLast(2)
  }
}
