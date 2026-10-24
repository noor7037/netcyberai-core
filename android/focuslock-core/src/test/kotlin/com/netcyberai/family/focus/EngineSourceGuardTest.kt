package com.netcyberai.family.focus

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// The engine stays plain Kotlin that runs on every Android version the app supports (minSdk 23):
// - no Android classes (they are not on this module's classpath anyway; this names the rule);
// - no java.time and no java.util.Base64 (Android 8, API 26, and later only);
// - no network, files or logging: the engine holds the rules, and nothing about app use may leave the phone (C304).
class EngineSourceGuardTest {
    // A package name not preceded by a dot or a letter, so "com.android.dialer" in a string is not a hit.
    private val forbidden = listOf("android\\.", "androidx\\.", "java\\.time\\.", "java\\.util\\.Base64", "java\\.net\\.", "java\\.io\\.", "java\\.util\\.logging\\.")
        .map { Regex("(?<![.\\w])$it") } + Regex("\\bprintln\\(")

    @Test
    fun mainSourcesUseOnlyPortableJvmClasses() {
        val dir = File("src/main/kotlin")
        assertTrue("run from the module directory", dir.isDirectory)
        val files = dir.walkTopDown().filter { it.isFile && it.extension == "kt" }.toList()
        assertTrue(files.size >= 5)
        val hits = files.flatMap { f ->
            f.readLines().mapIndexedNotNull { i, raw ->
                val line = raw.trim()
                val comment = line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")
                if (!comment && forbidden.any { it.containsMatchIn(line) }) "${f.name}:${i + 1}: $line" else null
            }
        }
        assertEquals(emptyList<String>(), hits)
    }

    @Test
    fun theGuardCatchesWhatItShould() {
        val caught = listOf("import android.content.Context", "import java.time.LocalDate", "val t = java.time.Instant.now()", "println(x)")
        val passed = listOf("\"com.android.dialer\",", "import javax.crypto.Mac", "import java.security.SecureRandom")
        for (line in caught) assertTrue(line, forbidden.any { it.containsMatchIn(line) })
        for (line in passed) assertTrue(line, forbidden.none { it.containsMatchIn(line) })
    }
}
