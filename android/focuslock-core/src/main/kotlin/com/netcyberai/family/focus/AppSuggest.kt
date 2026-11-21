package com.netcyberai.family.focus

// The apps ticked for the parent at set-up (docs/34 §9.1 rule 5: "starting from suggestions: social media, games,
// YouTube, video, browsers"; C538), so most parents only tap "Start". The phone gives each app's own category (Android's
// ApplicationInfo.category) and whether it opens web pages; the well-known Indian entertainment apps are named too,
// because many declare no category. Never ticked: WhatsApp (the parent's own switch), our two apps.
object AppSuggest {
    // Android's ApplicationInfo.CATEGORY_* values (stable since API 26).
    const val CATEGORY_GAME = 0
    const val CATEGORY_VIDEO = 2
    const val CATEGORY_SOCIAL = 4

    const val FAMILY_PACKAGE = "com.netcyberai.family"
    const val FOCUS_PACKAGE = "com.netcyberai.focus"

    val SUGGESTED_CATEGORIES: Set<Int> = setOf(CATEGORY_GAME, CATEGORY_VIDEO, CATEGORY_SOCIAL)

    val KNOWN: Set<String> = setOf(
        // video
        "com.google.android.youtube", "app.revanced.android.youtube", "com.google.android.apps.youtube.kids",
        "com.mxtech.videoplayer.ad", "com.netflix.mediaclient", "in.startv.hotstar", "com.jio.media.ondemand",
        "com.amazon.avod.thirdpartyclient", "com.graymatrix.did", "com.sonyliv",
        // short video and social
        "com.instagram.android", "com.instagram.lite", "com.facebook.katana", "com.facebook.lite", "com.snapchat.android",
        "in.mohalla.sharechat", "in.mohalla.video", "com.eterno.shortvideos", "com.roposo.android", "video.like",
        "com.zhiliaoapp.musically", "com.ss.android.ugc.trill", "com.twitter.android", "com.pinterest",
        // games often played in India
        "com.pubg.imobile", "com.dts.freefireth", "com.dts.freefiremax", "com.ludo.king", "com.supercell.clashofclans",
        "com.kiloo.subwaysurf", "com.mojang.minecraftpe", "com.garena.game.codm", "com.activision.callofduty.shooter",
    )

    val NEVER: Set<String> = DevicePackages.WHATSAPP + setOf(FAMILY_PACKAGE, FOCUS_PACKAGE)

    fun suggested(packageName: String, category: Int, opensWebPages: Boolean): Boolean =
        packageName !in NEVER && (opensWebPages || category in SUGGESTED_CATEGORIES || packageName in KNOWN)
}
