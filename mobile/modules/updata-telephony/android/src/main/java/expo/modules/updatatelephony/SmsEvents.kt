package expo.modules.updatatelephony

/**
 * Bridge from the (process-wide) SMS receivers to the JS module instance, if one
 * is alive. Receivers ALWAYS persist to SmsStore first; emitting is best-effort.
 */
internal object SmsEvents {
  @Volatile var emitter: ((event: String, payload: Map<String, Any?>) -> Unit)? = null

  fun emit(event: String, payload: Map<String, Any?>) {
    try { emitter?.invoke(event, payload) } catch (e: Exception) { /* JS not ready */ }
  }

  const val STATUS = "onSmsStatus"
  const val RECEIVED = "onSmsReceived"
}
