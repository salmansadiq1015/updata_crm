package expo.modules.updatatelephony

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SmsLogicTest {
  @Test
  fun mapsSentResultCodes() {
    assertEquals("OK", SmsLogic.sentResultName(-1))
    assertEquals("RESULT_ERROR_NO_SERVICE", SmsLogic.sentResultName(4))
    assertEquals("RESULT_ERROR_99", SmsLogic.sentResultName(99))
  }

  @Test
  fun aggregatesMultipartOutcomes() {
    assertNull(SmsLogic.aggregate(2, mapOf(0 to "OK")))
    assertEquals("sent" to null, SmsLogic.aggregate(2, mapOf(0 to "OK", 1 to "OK")))
    assertEquals("failed" to "RESULT_ERROR_RADIO_OFF", SmsLogic.aggregate(2, mapOf(1 to "RESULT_ERROR_NO_SERVICE", 0 to "RESULT_ERROR_RADIO_OFF")))
    // Some fragments may have reached the lead: never report "failed" (which would allow a resend).
    assertEquals("unknown" to "PARTIAL_SEND", SmsLogic.aggregate(3, mapOf(0 to "OK", 1 to "RESULT_ERROR_NO_SERVICE", 2 to "OK")))
  }

  @Test
  fun matchesOnlyWatchedNumbers() {
    val watched = listOf("+41795551001", "+923001234567")
    assertEquals("+41795551001", SmsLogic.matchWatched("0795551001", watched))
    assertEquals("+923001234567", SmsLogic.matchWatched("03001234567", watched))
    assertNull(SmsLogic.matchWatched("+41795551002", watched))
    assertNull(SmsLogic.matchWatched("Swisscom", watched)) // alphanumeric senders never match
    assertFalse(SmsLogic.sameTail("12345", "12345"))
  }

  @Test
  fun inboundKeyIsStableAndDistinct() {
    val a = SmsLogic.inboundKey("+41795551001", 1000L, "yes", 2)
    assertEquals(a, SmsLogic.inboundKey("+41795551001", 1000L, "yes", 2))
    assertNotEquals(a, SmsLogic.inboundKey("+41795551001", 1001L, "yes", 2))
    assertTrue(a.startsWith("in_") && a.length == 51)
  }
}
