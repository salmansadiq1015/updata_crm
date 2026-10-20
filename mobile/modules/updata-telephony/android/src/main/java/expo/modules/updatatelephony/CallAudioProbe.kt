package expo.modules.updatatelephony

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.os.Build
import android.telephony.TelephonyManager
import kotlin.math.PI
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Diagnostics only: measures what THIS device lets an ordinary app do with audio while a
 * SIM call is active, so the product claims about "AI hears / speaks on a SIM call" rest on
 * evidence from the real device rather than on documentation.
 *
 * Nothing is stored or uploaded: each capture is reduced to level statistics (RMS / peak)
 * in memory and the samples are discarded.
 */
internal object CallAudioProbe {
  private const val RATE = 16_000

  val SOURCES: Map<String, Int> = linkedMapOf(
    "MIC" to MediaRecorder.AudioSource.MIC,
    "VOICE_COMMUNICATION" to MediaRecorder.AudioSource.VOICE_COMMUNICATION,
    "VOICE_RECOGNITION" to MediaRecorder.AudioSource.VOICE_RECOGNITION,
    "UNPROCESSED" to MediaRecorder.AudioSource.UNPROCESSED,
    "CAMCORDER" to MediaRecorder.AudioSource.CAMCORDER,
    "VOICE_CALL" to MediaRecorder.AudioSource.VOICE_CALL,
    "VOICE_DOWNLINK" to MediaRecorder.AudioSource.VOICE_DOWNLINK,
    "VOICE_UPLINK" to MediaRecorder.AudioSource.VOICE_UPLINK,
  )

  private fun hasMic(context: Context) =
    context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

  @SuppressLint("MissingPermission")
  private fun capture(context: Context, name: String, source: Int, ms: Int): Map<String, Any?> {
    val base = mutableMapOf<String, Any?>("source" to name)
    if (!hasMic(context)) return base + ("result" to "no_permission")
    val minBuf = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    if (minBuf <= 0) return base + ("result" to "unsupported_format")
    val rec = try {
      AudioRecord(source, RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, max(minBuf, RATE / 5 * 2))
    } catch (e: Exception) {
      return base + mapOf("result" to "construct_error", "error" to e.javaClass.simpleName)
    }
    try {
      if (rec.state != AudioRecord.STATE_INITIALIZED) return base + ("result" to "init_failed")
      try {
        rec.startRecording()
      } catch (e: Exception) {
        return base + mapOf("result" to "start_error", "error" to e.javaClass.simpleName)
      }
      if (rec.recordingState != AudioRecord.RECORDSTATE_RECORDING) return base + ("result" to "not_recording")
      val buf = ShortArray(RATE / 10)
      var samples = 0L
      var sumSq = 0.0
      var peak = 0
      var readErrors = 0
      var silenced: Boolean? = null
      val deadline = System.currentTimeMillis() + ms
      while (System.currentTimeMillis() < deadline) {
        val n = rec.read(buf, 0, buf.size)
        if (n < 0) { readErrors++; if (readErrors > 5) break; continue }
        for (i in 0 until n) {
          val v = buf[i].toInt()
          sumSq += v.toDouble() * v
          if (kotlin.math.abs(v) > peak) peak = kotlin.math.abs(v)
        }
        samples += n
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && silenced == null) {
          silenced = rec.activeRecordingConfiguration?.isClientSilenced
        }
      }
      val rms = if (samples > 0) sqrt(sumSq / samples) else 0.0
      return base + mapOf(
        "result" to (if (samples == 0L) "no_samples" else "ok"),
        "seconds" to samples.toDouble() / RATE,
        "rms" to rms.toInt(),
        "peak" to peak,
        // Android 10+ reports when the platform feeds this client silence (e.g. during a call).
        "clientSilenced" to silenced,
        "readErrors" to readErrors,
      )
    } finally {
      try { rec.stop() } catch (_: Exception) {}
      rec.release()
    }
  }

  fun probe(context: Context, names: List<String>, ms: Int): Map<String, Any?> {
    val list = (if (names.isEmpty()) SOURCES.keys.toList() else names).mapNotNull { n -> SOURCES[n]?.let { n to it } }
    return state(context) + ("captures" to list.map { (n, s) -> capture(context, n, s, ms) })
  }

  fun state(context: Context): Map<String, Any?> {
    val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
    @Suppress("DEPRECATION")
    val callState = try {
      when (tm.callState) {
        TelephonyManager.CALL_STATE_IDLE -> "idle"
        TelephonyManager.CALL_STATE_RINGING -> "ringing"
        TelephonyManager.CALL_STATE_OFFHOOK -> "offhook"
        else -> "unknown"
      }
    } catch (e: SecurityException) { "no_permission" }
    val mode = when (am.mode) {
      AudioManager.MODE_IN_CALL -> "in_call"
      AudioManager.MODE_IN_COMMUNICATION -> "in_communication"
      AudioManager.MODE_RINGTONE -> "ringtone"
      AudioManager.MODE_NORMAL -> "normal"
      else -> "other_${am.mode}"
    }
    val comm = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) am.communicationDevice?.type?.let(::deviceName) else null
    @Suppress("DEPRECATION")
    return mapOf(
      "sdk" to Build.VERSION.SDK_INT,
      "manufacturer" to Build.MANUFACTURER,
      "model" to Build.MODEL,
      "callState" to callState,
      "audioMode" to mode,
      "speakerphoneOn" to am.isSpeakerphoneOn,
      "communicationDevice" to comm,
      "micPermission" to hasMic(context),
    )
  }

  private fun deviceName(type: Int) = when (type) {
    AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
    AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "earpiece"
    AudioDeviceInfo.TYPE_WIRED_HEADSET -> "wired_headset"
    AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "bluetooth_sco"
    else -> "type_$type"
  }

  /** Try to switch the active call audio to/from the loudspeaker as a non-dialer app. */
  fun setSpeaker(context: Context, on: Boolean): Map<String, Any?> {
    val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    var accepted: Boolean? = null
    var error: String? = null
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        if (on) {
          val speaker = am.availableCommunicationDevices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
          accepted = speaker?.let { am.setCommunicationDevice(it) } ?: false
        } else {
          am.clearCommunicationDevice(); accepted = true
        }
      } else {
        @Suppress("DEPRECATION")
        am.isSpeakerphoneOn = on
        accepted = true
      }
    } catch (e: Exception) {
      error = e.javaClass.simpleName
    }
    return mapOf("requested" to on, "accepted" to accepted, "error" to error) + state(context)
  }

  /**
   * Play a 1 kHz tone with the given usage while recording MIC, to see whether the app's own
   * playback is audible to the device microphone during the call (the acoustic path an
   * "AI over speakerphone" bridge would rely on). It cannot tell whether the far end hears it.
   */
  fun toneLoop(context: Context, usage: String, ms: Int): Map<String, Any?> {
    val usageCode = if (usage == "media") AudioAttributes.USAGE_MEDIA else AudioAttributes.USAGE_VOICE_COMMUNICATION
    val n = RATE * ms / 1000
    val pcm = ShortArray(n) { i -> (sin(2 * PI * 1000 * i / RATE) * 12000).toInt().toShort() }
    val track = try {
      AudioTrack.Builder()
        .setAudioAttributes(AudioAttributes.Builder().setUsage(usageCode).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
        .setAudioFormat(AudioFormat.Builder().setSampleRate(RATE).setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
        .setTransferMode(AudioTrack.MODE_STATIC)
        .setBufferSizeInBytes(n * 2)
        .build()
    } catch (e: Exception) {
      return mapOf("usage" to usage, "result" to "track_error", "error" to e.javaClass.simpleName)
    }
    return try {
      track.write(pcm, 0, n)
      track.play()
      val mic = capture(context, "MIC", MediaRecorder.AudioSource.MIC, ms)
      mapOf("usage" to usage, "result" to "played", "micWhilePlaying" to mic)
    } catch (e: Exception) {
      mapOf("usage" to usage, "result" to "play_error", "error" to e.javaClass.simpleName)
    } finally {
      try { track.stop() } catch (_: Exception) {}
      track.release()
    }
  }
}
