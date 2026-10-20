package expo.modules.updatatelephony

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.telephony.SmsMessage

/** SENT / DELIVERED results for SmsSender's PendingIntents. Persists first, then emits. */
class SmsResultReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val messageId = intent.getStringExtra(SmsSender.EXTRA_MESSAGE_ID) ?: return
    val part = intent.getIntExtra(SmsSender.EXTRA_PART, 0)
    val store = SmsStore.get(context)
    val now = System.currentTimeMillis()
    when (intent.action) {
      SmsSender.ACTION_SENT -> {
        val entry = store.journalPartResult(messageId, part, SmsLogic.sentResultName(resultCode), now) ?: return
        SmsEvents.emit(SmsEvents.STATUS, mapOf(
          "messageId" to messageId, "status" to entry.optString("status"),
          "errorCode" to entry.opt("errorCode")?.takeIf { it != org.json.JSONObject.NULL },
        ))
      }
      SmsSender.ACTION_DELIVERED -> {
        if (deliveredOk(intent)) {
          store.journalDelivered(messageId, now)
          SmsEvents.emit(SmsEvents.STATUS, mapOf("messageId" to messageId, "status" to "delivered"))
        }
      }
    }
  }

  /** TP-Status from the delivery report PDU: 0x00–0x1F means delivered. */
  private fun deliveredOk(intent: Intent): Boolean = try {
    val pdu = intent.getByteArrayExtra("pdu") ?: return false
    val format = intent.getStringExtra("format") ?: "3gpp" 
    val message = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) SmsMessage.createFromPdu(pdu, format) else {
      @Suppress("DEPRECATION") SmsMessage.createFromPdu(pdu)
    }
    message != null && message.status in 0..0x1F
  } catch (e: Exception) {
    false
  }
}
