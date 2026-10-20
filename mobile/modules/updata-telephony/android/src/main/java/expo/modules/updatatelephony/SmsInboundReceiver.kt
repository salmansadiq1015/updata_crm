package expo.modules.updatatelephony

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import org.json.JSONObject

/**
 * SMS_RECEIVED (private build only; protected by BROADCAST_SMS so only the system
 * can deliver it). Keeps ONLY replies from numbers in the user's active SMS-agent
 * conversations (the watch list); every other SMS is ignored and never stored or
 * uploaded. The app does not replace the user's SMS app: messages still appear
 * in the inbox as usual.
 */
class SmsInboundReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    val parts = try { Telephony.Sms.Intents.getMessagesFromIntent(intent) } catch (e: Exception) { null } ?: return
    if (parts.isEmpty()) return
    val store = SmsStore.get(context)
    val watched = store.watched()
    if (watched.isEmpty()) return
    val subscriptionId = intent.getIntExtra("subscription", intent.getIntExtra("android.telephony.extra.SUBSCRIPTION_INDEX", -1))

    // One broadcast = one (possibly multipart) message; group defensively by sender.
    parts.filterNotNull().groupBy { it.displayOriginatingAddress ?: it.originatingAddress ?: "" }.forEach { (from, segs) ->
      val matched = SmsLogic.matchWatched(from, watched) ?: return@forEach
      val body = segs.joinToString("") { it.displayMessageBody ?: it.messageBody ?: "" }
      val receivedAt = segs.minOf { it.timestampMillis }
      val key = SmsLogic.inboundKey(from, receivedAt, body, subscriptionId)
      store.inboundAdd(JSONObject()
        .put("key", key).put("from", from).put("matchedTo", matched).put("body", body)
        .put("receivedAt", receivedAt).put("subscriptionId", subscriptionId))
      Log.i("UpdataSms", "inbound reply kept from=${TelephonyMappers.redact(from)} len=${body.length}")
      SmsEvents.emit(SmsEvents.RECEIVED, mapOf("key" to key))
    }
  }
}
