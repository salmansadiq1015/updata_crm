package expo.modules.updatatelephony

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

/**
 * Durable native state for the SMS agent (SharedPreferences, survives process
 * death; app data is excluded from backup by the app config):
 *  - outbound journal: one entry per CRM message id, written BEFORE SmsManager is
 *    called, updated by the SENT/DELIVERED receivers. JS reads and acknowledges it.
 *  - inbound queue: replies from watched numbers, until JS uploaded them.
 *  - watch list: E.164 numbers of the user's active conversations.
 * Bounded; contains phone numbers and SMS text only for active conversations.
 */
internal class SmsStore(context: Context) {
  private val prefs: SharedPreferences =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  // ---------------------------------------------------------------- outbound journal
  @Synchronized
  fun journalStart(messageId: String, parts: Int, now: Long) {
    val all = readObject(KEY_JOURNAL)
    if (all.has(messageId)) return // never restart an existing attempt
    all.put(messageId, JSONObject()
      .put("messageId", messageId).put("startedAt", now).put("parts", parts)
      .put("results", JSONObject()).put("status", "attempting"))
    writeObject(KEY_JOURNAL, prune(all))
  }

  @Synchronized
  fun journalHas(messageId: String): Boolean = readObject(KEY_JOURNAL).has(messageId)

  /** Records one part's result; returns the entry once its final status is known. */
  @Synchronized
  fun journalPartResult(messageId: String, part: Int, result: String, now: Long): JSONObject? {
    val all = readObject(KEY_JOURNAL)
    val entry = all.optJSONObject(messageId) ?: return null
    val results = entry.optJSONObject("results") ?: JSONObject()
    results.put(part.toString(), result)
    entry.put("results", results)
    val map = results.keys().asSequence().associate { it.toInt() to results.getString(it) }
    val outcome = SmsLogic.aggregate(entry.optInt("parts", 1), map)
    if (outcome != null && entry.optString("status") == "attempting") {
      entry.put("status", outcome.first).put("errorCode", outcome.second ?: JSONObject.NULL).put("finishedAt", now)
    }
    all.put(messageId, entry)
    writeObject(KEY_JOURNAL, all)
    return if (outcome != null) entry else null
  }

  @Synchronized
  fun journalDelivered(messageId: String, now: Long) {
    val all = readObject(KEY_JOURNAL)
    val entry = all.optJSONObject(messageId) ?: return
    if (!entry.has("deliveredAt")) entry.put("deliveredAt", now)
    all.put(messageId, entry)
    writeObject(KEY_JOURNAL, all)
  }

  /** Marks an attempt whose SmsManager call threw before any part was queued. */
  @Synchronized
  fun journalFail(messageId: String, code: String, now: Long) {
    val all = readObject(KEY_JOURNAL)
    val entry = all.optJSONObject(messageId) ?: return
    entry.put("status", "failed").put("errorCode", code).put("finishedAt", now)
    all.put(messageId, entry)
    writeObject(KEY_JOURNAL, all)
  }

  @Synchronized
  fun journalEntries(): List<JSONObject> {
    val all = readObject(KEY_JOURNAL)
    return all.keys().asSequence().map { all.getJSONObject(it) }.filter { !it.optBoolean("acked") }.toList()
  }

  /** JS confirmed the CRM recorded the final status (and delivery, if any). */
  @Synchronized
  fun journalAck(messageIds: List<String>, now: Long) {
    val all = readObject(KEY_JOURNAL)
    for (id in messageIds) all.optJSONObject(id)?.put("acked", true)?.put("ackedAt", now)
    writeObject(KEY_JOURNAL, prune(all))
  }

  // ---------------------------------------------------------------- inbound queue
  @Synchronized
  fun inboundAdd(entry: JSONObject) {
    val all = readObject(KEY_INBOUND)
    val key = entry.getString("key")
    if (all.has(key)) return
    all.put(key, entry)
    // Bounded: drop the oldest beyond the cap (they are re-sent by nobody; log loudly in JS).
    while (all.length() > MAX_INBOUND) {
      val oldest = all.keys().asSequence().minByOrNull { all.getJSONObject(it).optLong("receivedAt") } ?: break
      all.remove(oldest)
    }
    writeObject(KEY_INBOUND, all)
  }

  @Synchronized
  fun inboundEntries(): List<JSONObject> {
    val all = readObject(KEY_INBOUND)
    return all.keys().asSequence().map { all.getJSONObject(it) }.sortedBy { it.optLong("receivedAt") }.toList()
  }

  @Synchronized
  fun inboundAck(keys: List<String>) {
    val all = readObject(KEY_INBOUND)
    keys.forEach { all.remove(it) }
    writeObject(KEY_INBOUND, all)
  }

  // ---------------------------------------------------------------- watch list
  @Synchronized
  fun setWatched(numbers: List<String>) {
    prefs.edit().putString(KEY_WATCH, JSONArray(numbers.distinct().take(MAX_WATCH)).toString()).apply()
  }

  @Synchronized
  fun watched(): List<String> {
    val arr = try { JSONArray(prefs.getString(KEY_WATCH, "[]")) } catch (e: Exception) { JSONArray() }
    return (0 until arr.length()).map { arr.getString(it) }
  }

  // ---------------------------------------------------------------- helpers
  private fun readObject(key: String): JSONObject =
    try { JSONObject(prefs.getString(key, "{}") ?: "{}") } catch (e: Exception) { JSONObject() }

  private fun writeObject(key: String, value: JSONObject) {
    prefs.edit().putString(key, value.toString()).apply()
  }

  /** Keep the journal bounded: drop acknowledged entries older than a week, cap the size. */
  private fun prune(all: JSONObject): JSONObject {
    val weekAgo = System.currentTimeMillis() - 7L * 24 * 3600 * 1000
    for (key in all.keys().asSequence().toList()) {
      val e = all.getJSONObject(key)
      if (e.optBoolean("acked") && e.optLong("ackedAt") < weekAgo) all.remove(key)
    }
    while (all.length() > MAX_JOURNAL) {
      val oldestAcked = all.keys().asSequence().filter { all.getJSONObject(it).optBoolean("acked") }
        .minByOrNull { all.getJSONObject(it).optLong("startedAt") } ?: break
      all.remove(oldestAcked)
    }
    return all
  }

  companion object {
    private const val PREFS = "updata_sms_agent"
    private const val KEY_JOURNAL = "outbound_journal"
    private const val KEY_INBOUND = "inbound_queue"
    private const val KEY_WATCH = "watch_list"
    private const val MAX_JOURNAL = 500
    private const val MAX_INBOUND = 500
    private const val MAX_WATCH = 1000

    @Volatile private var instance: SmsStore? = null
    fun get(context: Context): SmsStore =
      instance ?: synchronized(this) { instance ?: SmsStore(context).also { instance = it } }
  }
}
