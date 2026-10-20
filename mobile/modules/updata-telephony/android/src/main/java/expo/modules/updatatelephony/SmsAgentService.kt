package expo.modules.updatatelephony

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Foreground service (private build) that runs the AI SMS agent loop while the
 * screen is off or the app is in the background.
 *
 * React Native pauses JS timers when the activity pauses, so a plain JS loop
 * would silently stop. This service starts the "UpdataSmsAgent" Headless JS task;
 * while a headless task is active RN keeps timers running. The task (one JS
 * singleton loop, however often the service is started) leases, sends and
 * uploads; it finishes when no campaign is running, which stops this service.
 * A persistent notification tells the user the phone is sending SMS.
 */
class SmsAgentService : HeadlessJsTaskService() {
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
      stopSelf()
      return START_NOT_STICKY
    }
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "AI SMS agent running"
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: "Sending and receiving SMS from this phone"
    val notification = buildNotification(this, title, text)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    return try {
      super.onStartCommand(intent, flags, startId)
      // Restart after the OS kills the process; the JS task restores the session itself.
      START_STICKY
    } catch (e: Exception) {
      // Never take the app down: without the headless task the agent simply does not run
      // in the background (the in-app loop still runs while the app is open).
      android.util.Log.e("UpdataSms", "Agent task could not start: ${e.javaClass.simpleName}: ${e.message}")
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
      stopSelf()
      START_NOT_STICKY
    }
  }

  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig =
    // timeout 0 = no timeout; allowed while the app is in the foreground too.
    HeadlessJsTaskConfig(TASK_NAME, Arguments.createMap(), 0, true)

  override fun onHeadlessJsTaskFinish(taskId: Int) {
    super.onHeadlessJsTaskFinish(taskId)
  }

  companion object {
    const val TASK_NAME = "UpdataSmsAgent"
    const val ACTION_START = "expo.modules.updatatelephony.AGENT_START"
    const val ACTION_STOP = "expo.modules.updatatelephony.AGENT_STOP"
    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
    private const val CHANNEL_ID = "updata_sms_agent"
    private const val NOTIFICATION_ID = 7301

    fun buildNotification(ctx: Context, title: String, text: String): Notification {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        if (nm?.getNotificationChannel(CHANNEL_ID) == null) {
          nm?.createNotificationChannel(NotificationChannel(CHANNEL_ID, "AI SMS agent", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Shown while the AI SMS agent sends messages from this phone"
          })
        }
      }
      val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
      val content = launch?.let {
        PendingIntent.getActivity(ctx, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      }
      val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(ctx, CHANNEL_ID)
      else @Suppress("DEPRECATION") Notification.Builder(ctx)
      return builder
        .setContentTitle(title)
        .setContentText(text)
        .setSmallIcon(ctx.applicationInfo.icon)
        .setOngoing(true)
        .setContentIntent(content)
        .build()
    }
  }
}
