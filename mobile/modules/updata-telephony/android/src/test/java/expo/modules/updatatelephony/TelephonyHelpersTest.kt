package expo.modules.updatatelephony

import android.telephony.TelephonyManager
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TelephonyHelpersTest {
  @Test
  fun simStateMapping() {
    assertEquals("ready", TelephonyMappers.simState(TelephonyManager.SIM_STATE_READY))
    assertEquals("absent", TelephonyMappers.simState(TelephonyManager.SIM_STATE_ABSENT))
    assertEquals("locked", TelephonyMappers.simState(TelephonyManager.SIM_STATE_PIN_REQUIRED))
    assertEquals("locked", TelephonyMappers.simState(TelephonyManager.SIM_STATE_PUK_REQUIRED))
    assertEquals("locked", TelephonyMappers.simState(TelephonyManager.SIM_STATE_NETWORK_LOCKED))
    assertEquals("not_ready", TelephonyMappers.simState(TelephonyManager.SIM_STATE_NOT_READY))
    assertEquals("unknown", TelephonyMappers.simState(TelephonyManager.SIM_STATE_UNKNOWN))
    assertEquals("unknown", TelephonyMappers.simState(999))
  }

  @Test
  fun callStateMapping() {
    assertEquals("idle", TelephonyMappers.callState(TelephonyManager.CALL_STATE_IDLE))
    assertEquals("ringing", TelephonyMappers.callState(TelephonyManager.CALL_STATE_RINGING))
    assertEquals("offhook", TelephonyMappers.callState(TelephonyManager.CALL_STATE_OFFHOOK))
    assertNull(TelephonyMappers.callState(42))
  }

  @Test
  fun sanitizeDialable() {
    assertEquals("+491701234567", TelephonyMappers.sanitizeDialable(" +49 (170) 123-45.67 "))
    assertEquals("0301234", TelephonyMappers.sanitizeDialable("030 1234"))
    assertNull(TelephonyMappers.sanitizeDialable(""))
    assertNull(TelephonyMappers.sanitizeDialable(null))
    assertNull(TelephonyMappers.sanitizeDialable("12"))
    assertNull(TelephonyMappers.sanitizeDialable("*#06#"))
    assertNull(TelephonyMappers.sanitizeDialable("+49abc"))
    assertNull(TelephonyMappers.sanitizeDialable("++49170"))
  }

  @Test
  fun redactKeepsAtMostTwoDigits() {
    assertEquals("…67", TelephonyMappers.redact("+491701234567"))
    assertEquals("**", TelephonyMappers.redact("7"))
    assertEquals("<empty>", TelephonyMappers.redact(null))
    assertFalse(TelephonyMappers.redact("+491701234567").contains("4917"))
  }

  private fun ev(op: String, at: Long, state: String = "idle") =
    CallStateRecord(op, state, at, "telephony_callback")

  @Test
  fun bufferBoundsEventsPerOperation() {
    val b = CallEventBuffer(maxEventsPerOperation = 3, maxOperations = 5)
    (1L..5L).forEach { b.append(ev("a", it)) }
    assertEquals(listOf(3L, 4L, 5L), b.eventsFor("a").map { it.at })
  }

  @Test
  fun bufferDropsLeastRecentlyWrittenOperation() {
    val b = CallEventBuffer(maxEventsPerOperation = 10, maxOperations = 2)
    b.append(ev("a", 1))
    b.append(ev("b", 2))
    b.append(ev("a", 3)) // a is now most recently written
    b.append(ev("c", 4)) // evicts b
    assertEquals(listOf("a", "c"), b.operationIds())
    assertTrue(b.eventsFor("b").isEmpty())
    assertEquals(listOf(1L, 3L), b.eventsFor("a").map { it.at })
  }

  @Test
  fun bufferSnapshotRoundTripsAndClears() {
    val b = CallEventBuffer()
    b.append(ev("a", 1, "offhook"))
    b.append(ev("b", 2))
    b.append(ev("a", 3, "idle"))
    val restored = CallEventBuffer().apply { load(b.snapshot()) }
    assertEquals(b.eventsFor("a"), restored.eventsFor("a"))
    assertEquals(b.operationIds(), restored.operationIds())
    restored.clear("a")
    assertTrue(restored.eventsFor("a").isEmpty())
    assertEquals(1, restored.eventsFor("b").size)
  }

  @Test
  fun defaultBounds() {
    val b = CallEventBuffer()
    (1..25).forEach { op -> (1..60).forEach { b.append(ev("op$op", it.toLong())) } }
    assertEquals(20, b.operationIds().size)
    assertEquals("op6", b.operationIds().first())
    assertEquals(50, b.eventsFor("op25").size)
    assertEquals(11L, b.eventsFor("op25").first().at)
  }
}
