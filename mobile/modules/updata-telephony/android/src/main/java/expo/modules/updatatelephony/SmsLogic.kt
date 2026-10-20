package expo.modules.updatatelephony

import java.security.MessageDigest

/**
 * Pure SMS helpers (no Android dependencies) — unit-tested on the JVM.
 */
internal object SmsLogic {
  const val RESULT_OK = -1 // android.app.Activity.RESULT_OK

  /** SmsManager sent-result code → stable name reported to the CRM. */
  fun sentResultName(code: Int): String = when (code) {
    RESULT_OK -> "OK"
    1 -> "RESULT_ERROR_GENERIC_FAILURE"
    2 -> "RESULT_ERROR_RADIO_OFF"
    3 -> "RESULT_ERROR_NULL_PDU"
    4 -> "RESULT_ERROR_NO_SERVICE"
    5 -> "RESULT_ERROR_LIMIT_EXCEEDED"
    6 -> "RESULT_ERROR_FDN_CHECK_FAILURE"
    7 -> "RESULT_ERROR_SHORT_CODE_NOT_ALLOWED"
    8 -> "RESULT_ERROR_SHORT_CODE_NEVER_ALLOWED"
    9 -> "RESULT_RADIO_NOT_AVAILABLE"
    10 -> "RESULT_NETWORK_REJECT"
    11 -> "RESULT_INVALID_ARGUMENTS"
    12 -> "RESULT_INVALID_STATE"
    13 -> "RESULT_NO_MEMORY"
    14 -> "RESULT_INVALID_SMS_FORMAT"
    15 -> "RESULT_SYSTEM_ERROR"
    16 -> "RESULT_MODEM_ERROR"
    17 -> "RESULT_NETWORK_ERROR"
    18 -> "RESULT_ENCODING_ERROR"
    19 -> "RESULT_INVALID_SMSC_ADDRESS"
    20 -> "RESULT_OPERATION_NOT_ALLOWED"
    21 -> "RESULT_INTERNAL_ERROR"
    22 -> "RESULT_NO_RESOURCES"
    23 -> "RESULT_CANCELLED"
    24 -> "RESULT_REQUEST_NOT_SUPPORTED"
    else -> "RESULT_ERROR_$code"
  }

  /**
   * Final outcome of a multipart send once every part reported:
   * - all OK                → "sent"
   * - none OK               → "failed" (nothing reached the network; safe to retry)
   * - some OK, some failed  → "unknown" (the lead may have received fragments; never auto-resend)
   * Returns null while parts are still outstanding.
   */
  fun aggregate(parts: Int, results: Map<Int, String>): Pair<String, String?>? {
    if (parts <= 0 || results.size < parts) return null
    val ok = results.values.count { it == "OK" }
    val firstError = results.toSortedMap().values.firstOrNull { it != "OK" }
    return when {
      ok == parts -> "sent" to null
      ok == 0 -> "failed" to firstError
      else -> "unknown" to "PARTIAL_SEND"
    }
  }

  fun digits(value: String?): String = value.orEmpty().filter { it.isDigit() }

  /** Same subscriber when the last [n] digits match (country code / formatting agnostic). */
  fun sameTail(a: String?, b: String?, n: Int = 9): Boolean {
    val da = digits(a)
    val db = digits(b)
    if (da.length < 6 || db.length < 6) return false
    return da.takeLast(n) == db.takeLast(n)
  }

  /** The watched number this sender corresponds to, or null (→ the SMS is not kept). */
  fun matchWatched(from: String?, watched: Collection<String>): String? =
    watched.firstOrNull { sameTail(from, it) }

  /** Stable de-duplication key for one received SMS (sent to the CRM, never the raw text). */
  fun inboundKey(from: String, timestampMillis: Long, body: String, subscriptionId: Int): String {
    val digest = MessageDigest.getInstance("SHA-256")
      .digest("$from|$timestampMillis|$subscriptionId|$body".toByteArray(Charsets.UTF_8))
    return "in_" + digest.joinToString("") { "%02x".format(it) }.take(48)
  }
}
