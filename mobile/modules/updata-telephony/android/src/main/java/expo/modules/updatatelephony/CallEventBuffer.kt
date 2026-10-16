package expo.modules.updatatelephony

/** One observed call-state transition (mirrors the JS `CallStateEvent`). */
internal data class CallStateRecord(
  val operationId: String,
  val state: String,
  val at: Long,
  val source: String
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "operationId" to operationId,
    "state" to state,
    "at" to at.toDouble(),
    "source" to source
  )
}

/**
 * Bounded, insertion-ordered event buffer. Pure Kotlin (JVM-testable).
 *
 * - at most [maxEventsPerOperation] events per operation (oldest events dropped);
 * - at most [maxOperations] operations (the operation least recently written is dropped).
 */
internal class CallEventBuffer(
  private val maxEventsPerOperation: Int = MAX_EVENTS_PER_OPERATION,
  private val maxOperations: Int = MAX_OPERATIONS
) {
  // accessOrder=false: we re-insert on write so iteration order = least recently written first.
  private val ops = LinkedHashMap<String, MutableList<CallStateRecord>>()

  fun append(event: CallStateRecord) {
    val list = ops.remove(event.operationId) ?: mutableListOf()
    list.add(event)
    while (list.size > maxEventsPerOperation) list.removeAt(0)
    ops[event.operationId] = list
    while (ops.size > maxOperations) {
      val oldest = ops.keys.first()
      ops.remove(oldest)
    }
  }

  fun eventsFor(operationId: String): List<CallStateRecord> = ops[operationId]?.toList() ?: emptyList()

  fun clear(operationId: String) {
    ops.remove(operationId)
  }

  fun operationIds(): List<String> = ops.keys.toList()

  /** All events in storage order (operations least recently written first, events oldest first). */
  fun snapshot(): List<CallStateRecord> = ops.values.flatten()

  /** Rebuilds from a snapshot, re-applying the bounds. */
  fun load(events: List<CallStateRecord>) {
    ops.clear()
    events.forEach { append(it) }
  }

  companion object {
    const val MAX_EVENTS_PER_OPERATION = 50
    const val MAX_OPERATIONS = 20
  }
}
