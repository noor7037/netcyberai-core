package com.netcyberai.family.focus

import java.util.Random
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

class Pbkdf2Test {
    private fun hex(b: ByteArray) = b.joinToString("") { "%02x".format(it) }

    @Test
    fun rfc7914TestVector() {
        // RFC 7914 §11: PBKDF2-HMAC-SHA256 (P="passwd", S="salt", c=1, dkLen=64).
        val got = Pbkdf2.sha256("passwd".toByteArray(), "salt".toByteArray(), 1, 64)
        assertEquals(
            "55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc" +
                "49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783",
            hex(got),
        )
    }

    @Test
    fun matchesTheJvmImplementation() {
        // The JVM's own PBKDF2WithHmacSHA256 (missing on Android before API 26, hence our own) as the reference.
        val factory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        val random = Random(7)
        for (case in 0 until 12) {
            val pin = (0 until 6).map { ('0' + random.nextInt(10)) }.joinToString("")
            val salt = ByteArray(1 + random.nextInt(32)).also { random.nextBytes(it) }
            val iterations = 1 + random.nextInt(3_000)
            val length = listOf(16, 32, 33, 64, 80)[case % 5]
            val want = factory.generateSecret(PBEKeySpec(pin.toCharArray(), salt, iterations, length * 8)).encoded
            assertArrayEquals("case $case", want, Pbkdf2.sha256(pin.toByteArray(), salt, iterations, length))
        }
    }
}
