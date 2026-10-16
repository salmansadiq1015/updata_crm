package expo.modules.updatatelephony

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * Persists call-state events and the active monitoring operation in SharedPreferences
 * ("updata_telephony_events") so they survive JS reloads and process death.
 * Contains no phone numbers. Thread-safe (all access synchronized on this instance).
 */
internal class CallEventStore(context: Context) {
  private val prefs: SharedPreferences =
    context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
  private val buffer = CallEventBuffer()
  private var loaded = false

  @Synchronized
  fun append(event: CallStateRecord) {
    ensureLoaded()
    buffer.append(event)
    persist()
  }

  @Synchronized
  fun eventsFor(operationId: String): List<CallStateRecord> {
    ensureLoaded()
    return buffer.eventsFor(operationId)
  }

  @Synchronized
  fun clear(operationId: String) {
    ensureLoaded()
    buffer.clear(operationId)
    persist()
  }

  @Synchronized
  fun setActive(operationId: String?, startedAt: Long) {
    val editor = prefs.edit()
    if (operationId == null) {
      editor.remove(KEY_ACTIVE_OP).remove(KEY_ACTIVE_STARTED_AT)
    } else {
      editor.putString(KEY_ACTIVE_OP, operationId).putLong(KEY_ACTIVE_STARTED_AT, startedAt)
    }
    editor.apply()
  }

  @Synchronized
  fun activeOperation(): Pair<String, Long>? {
    val op = prefs.getString(KEY_ACTIVE_OP, null) ?: return null
    return op to prefs.getLong(KEY_ACTIVE_STARTED_AT, 0L)
  }

  private fun ensureLoaded() {
    if (loaded) return
    loaded = true
    val raw = prefs.getString(KEY_EVENTS, null) ?: return
    try {
      val arr = JSONArray(raw)
      val events = ArrayList<CallStateRecord>(arr.length())
      for (i in 0 until arr.length()) {
        val o = arr.getJSONObject(i)
        events.add(
          CallStateRecord(
            operationId = o.getString("operationId"),
            state = o.getString("state"),
            at = o.getLong("at"),
            source = o.getString("source")
          )
        )
      }
      buffer.load(events)
    } catch (e: Exception) {
      // Corrupt storage must never crash the app; start empty.
      Log.w(TAG, "Discarding unreadable persisted call-state events", e)
      buffer.load(emptyList())
    }
  }

  private fun persist() {
    val arr = JSONArray()
    buffer.snapshot().forEach { e ->
      arr.put(
        JSONObject()
          .put("operationId", e.operationId)
          .put("state", e.state)
          .put("at", e.at)
          .put("source", e.source)
      )
    }
    // commit() (synchronous) so an event observed right before process death is not lost.
    prefs.edit().putString(KEY_EVENTS, arr.toString()).commit()
  }

  companion object {
    const val PREFS_NAME = "updata_telephony_events"
    private const val KEY_EVENTS = "events_v1"
    private const val KEY_ACTIVE_OP = "active_operation_id"
    private const val KEY_ACTIVE_STARTED_AT = "active_started_at"
    private const val TAG = "UpdataTelephony"
  }
}
