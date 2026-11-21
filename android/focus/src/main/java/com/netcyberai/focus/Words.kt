package com.netcyberai.focus

import com.netcyberai.family.focus.Brand
import com.netcyberai.family.focus.StepKind

// Every word the Focus app shows or speaks, in English and spoken Hindi (C538). Short sentences, one action each, for
// parents who read little: the set-up screens can also read each step aloud (the phone's own voice).
object Words {
    private val en = mapOf(
        "lang.other" to "हिंदी",
        "welcome.title" to "Focus Lock: study first, then play",
        "welcome.body" to "In the times you choose, games, videos and social apps stay closed until today’s study in NetCyberAI Family is done. Then they open by themselves. Calls, messages and the phone always work. Your parent PIN opens everything, any time.",
        "welcome.privacy" to "Which apps are opened, and when, never leaves this phone. NetCyberAI only learns whether today’s study is done, and that the lock is on.",
        "connect.title" to "Connect with NetCyberAI Family",
        "connect.body" to "Open NetCyberAI Family. Go to Parent area (your PIN), then Focus Lock, then tap Connect. This app opens again by itself.",
        "connect.open" to "Open NetCyberAI Family",
        "connect.noFamily" to "Install NetCyberAI Family first and sign in, from the same place as this app.",
        "connect.working" to "Connecting…",
        "connect.failed" to "Could not connect. Check the internet, then tap Connect again in NetCyberAI Family.",
        "pin.title" to "Enter your parent PIN",
        "pin.body" to "The same 6-digit PIN as in NetCyberAI Family. Only you can open the apps or change the lock.",
        "pin.wrong" to "That PIN is not right.",
        "pin.wait" to "Too many wrong tries. Try again in {m} minutes.",
        "pin.noPin" to "Set a parent PIN in NetCyberAI Family first.",
        "pin.needNew" to "The parent PIN was changed. Open NetCyberAI Focus with the internet on and enter the new PIN.",
        "pin.offline" to "No internet. Connect, then try again.",
        "pin.cancel" to "Cancel",
        "pin.delete" to "Delete",
        "perm.title" to "Allow these on this phone",
        "perm.lead" to "Tap Open on each step. The phone’s own screen opens: switch NetCyberAI Focus on, then press Back. If the phone shows a warning with a countdown, wait for it, then tap OK.",
        "perm.listen" to "Listen",
        "perm.open" to "Open",
        "perm.done" to "Done",
        "perm.confirm" to "I have done it",
        "perm.next" to "Next",
        "perm.notify.t" to "Notifications",
        "perm.notify.b" to "Tap Allow. The lock shows a small note “Focus Lock is on”, so everyone can see it.",
        "perm.overlay.t" to "Display over other apps",
        "perm.overlay.b" to "Find NetCyberAI Focus and switch it on. The lock can then show its screen over a locked app.",
        "perm.usage.t" to "Usage access",
        "perm.usage.b" to "Find NetCyberAI Focus and switch it on. The lock can then see which app is open. That stays on this phone.",
        "perm.usage.grey" to "Is the switch grey? Tap here. App info opens: tap ⋮ at the top, then Allow restricted settings. Then try again.",
        "perm.battery.t" to "Battery",
        "perm.autostart.t" to "Start by itself",
        "perm.popup.t" to "Pop-up windows",
        "perm.popup.b" to "Switch on “Display pop-up windows while running in the background” and “Show on Lock screen”.",
        "autostart.XIAOMI" to "Find NetCyberAI Focus and switch Autostart on.",
        "autostart.VIVO" to "Find NetCyberAI Focus and switch on Background startup (Autostart).",
        "autostart.COLOROS" to "Find NetCyberAI Focus and switch on Auto launch (Auto startup).",
        "autostart.TRANSSION" to "Find NetCyberAI Focus and switch on Auto-start.",
        "autostart.fallback" to "App info opens. Look for Autostart or Auto launch, and switch it on.",
        "battery.XIAOMI" to "Tap No restrictions. (Or: App info, Battery saver, No restrictions.)",
        "battery.SAMSUNG" to "App info opens. Tap Battery, then Unrestricted.",
        "battery.VIVO" to "App info opens. Tap Battery, then allow background activity (high background power use).",
        "battery.COLOROS" to "App info opens. Tap Battery usage. Switch on Allow background activity and Allow auto launch.",
        "battery.ONEPLUS" to "App info opens. Tap Battery, then Unrestricted (or Allow background activity).",
        "battery.TRANSSION" to "App info opens. Tap Battery, then No restrictions. In Phone Master, keep NetCyberAI Focus protected.",
        "battery.STOCK" to "App info opens. Tap App battery usage, then Unrestricted.",
        "apps.title" to "Which apps to lock",
        "apps.lead" to "Already ticked: games, videos, social apps and browsers. Calls, messages and NetCyberAI Family always stay open.",
        "apps.whatsapp" to "Keep WhatsApp open in study times",
        "apps.none" to "Tick at least one app to lock.",
        "times.bad" to "Choose at least one day, and a start before the end.",
        "times.title" to "When to lock",
        "times.lead" to "Ready for you: Monday to Friday, 4 pm to 9 pm. Change it only if you want.",
        "times.from" to "From",
        "times.to" to "To",
        "start" to "Start the Focus Lock",
        "start.missing" to "Finish the steps above first.",
        "home.on" to "Focus Lock is on",
        "home.offTitle" to "Focus Lock is off",
        "home.times" to "Locked: {days}, {from} to {to}",
        "home.done" to "{name}: today’s study is done. Apps are open.",
        "home.pending" to "{name}: {n} left today.",
        "home.unknown" to "Waiting for today’s study from NetCyberAI.",
        "home.change" to "Change settings",
        "home.turnOff" to "Turn the lock off",
        "home.turnOn" to "Turn the lock on",
        "home.refresh" to "Check again",
        "home.permLost" to "A permission was switched off. The lock cannot work. Tap to fix it.",
        "home.removed" to "This phone was removed from the Focus Lock, or the family signed out. Connect again from NetCyberAI Family.",
        "home.parentOn" to "Parent time: all apps are open until {time}.",
        "home.lockNow" to "Lock now",
        "notif.channel" to "Focus Lock",
        "notif.title" to "Focus Lock is on",
        "notif.text" to "Apps open when today’s study is done.",
        "notif.fix" to "A permission is off. Tap to fix the Focus Lock.",
        "block.study" to "Study first!",
        "block.studyName" to "Study first, {name}!",
        "block.studyBody" to "Finish today’s study in NetCyberAI Family. Then this app opens by itself.",
        "block.left" to "Still to do today:",
        "block.offline" to "Connect to the internet, so NetCyberAI can see today’s study.",
        "block.start" to "Start studying",
        "block.pin" to "Parent PIN",
        "block.home" to "Go back",
        "block.choose" to "Who is using the phone?",
        "block.limit" to "Today’s time is used up",
        "block.limitBody" to "Come back tomorrow. A parent can open it with the PIN.",
        "block.settings" to "Locked in study time",
        "block.settingsBody" to "Settings, app stores and phone tools need the parent PIN now.",
        "day.1" to "Mon", "day.2" to "Tue", "day.3" to "Wed", "day.4" to "Thu", "day.5" to "Fri", "day.6" to "Sat", "day.7" to "Sun",
    )

    private val hi = mapOf(
        "lang.other" to "English",
        "welcome.title" to "फ़ोकस लॉक: पहले पढ़ाई, फिर खेल",
        "welcome.body" to "आप जो समय चुनें, उसमें गेम, वीडियो और सोशल ऐप तब तक बंद रहेंगे जब तक NetCyberAI Family में आज की पढ़ाई पूरी न हो। फिर वे अपने आप खुल जाएँगे। कॉल, मैसेज और फ़ोन हमेशा चलेंगे। आपका पेरेंट पिन कभी भी सब खोल देता है।",
        "welcome.privacy" to "कौन सा ऐप कब खुला, यह बात इस फ़ोन से बाहर नहीं जाती। NetCyberAI को सिर्फ़ इतना पता चलता है कि आज की पढ़ाई पूरी हुई या नहीं, और लॉक चालू है।",
        "connect.title" to "NetCyberAI Family से जोड़ें",
        "connect.body" to "NetCyberAI Family खोलें। पेरेंट एरिया (आपका पिन) में जाएँ, फिर फ़ोकस लॉक, फिर कनेक्ट दबाएँ। यह ऐप अपने आप फिर खुलेगा।",
        "connect.open" to "NetCyberAI Family खोलें",
        "connect.noFamily" to "पहले NetCyberAI Family इंस्टॉल करके साइन इन करें, उसी जगह से जहाँ से यह ऐप लिया।",
        "connect.working" to "जोड़ रहे हैं…",
        "connect.failed" to "जुड़ नहीं पाया। इंटरनेट देखें, फिर NetCyberAI Family में दोबारा कनेक्ट दबाएँ।",
        "pin.title" to "अपना पेरेंट पिन डालें",
        "pin.body" to "वही 6 अंकों का पिन जो NetCyberAI Family में है। सिर्फ़ आप ही ऐप खोल सकते हैं या लॉक बदल सकते हैं।",
        "pin.wrong" to "यह पिन सही नहीं है।",
        "pin.wait" to "बहुत बार गलत पिन। {m} मिनट बाद फिर कोशिश करें।",
        "pin.noPin" to "पहले NetCyberAI Family में पेरेंट पिन बनाएँ।",
        "pin.needNew" to "पेरेंट पिन बदल गया है। इंटरनेट चालू करके NetCyberAI Focus खोलें और नया पिन डालें।",
        "pin.offline" to "इंटरनेट नहीं है। जोड़कर फिर कोशिश करें।",
        "pin.cancel" to "रद्द करें",
        "pin.delete" to "मिटाएँ",
        "perm.title" to "इस फ़ोन पर ये चालू करें",
        "perm.lead" to "हर कदम पर खोलें दबाएँ। फ़ोन की अपनी स्क्रीन खुलेगी: NetCyberAI Focus चालू करें, फिर बैक दबाएँ। अगर फ़ोन गिनती वाली चेतावनी दिखाए, तो रुकें, फिर OK दबाएँ।",
        "perm.listen" to "सुनें",
        "perm.open" to "खोलें",
        "perm.done" to "हो गया",
        "perm.confirm" to "मैंने कर दिया",
        "perm.next" to "आगे",
        "perm.notify.t" to "सूचनाएँ",
        "perm.notify.b" to "Allow दबाएँ। लॉक एक छोटी सूचना दिखाता है “फ़ोकस लॉक चालू है”, ताकि सबको पता रहे।",
        "perm.overlay.t" to "दूसरे ऐप के ऊपर दिखाना",
        "perm.overlay.b" to "NetCyberAI Focus ढूँढें और चालू करें। तब लॉक बंद ऐप के ऊपर अपनी स्क्रीन दिखा सकेगा।",
        "perm.usage.t" to "ऐप इस्तेमाल की जानकारी",
        "perm.usage.b" to "NetCyberAI Focus ढूँढें और चालू करें। तब लॉक देख सकेगा कि कौन सा ऐप खुला है। यह बात इसी फ़ोन पर रहती है।",
        "perm.usage.grey" to "क्या बटन धुँधला है? यहाँ दबाएँ। ऐप जानकारी खुलेगी: ऊपर ⋮ दबाएँ, फिर Allow restricted settings। फिर दोबारा कोशिश करें।",
        "perm.battery.t" to "बैटरी",
        "perm.autostart.t" to "अपने आप शुरू होना",
        "perm.popup.t" to "पॉप-अप विंडो",
        "perm.popup.b" to "“Display pop-up windows while running in the background” और “Show on Lock screen” चालू करें।",
        "autostart.XIAOMI" to "NetCyberAI Focus ढूँढें और Autostart चालू करें।",
        "autostart.VIVO" to "NetCyberAI Focus ढूँढें और Background startup (Autostart) चालू करें।",
        "autostart.COLOROS" to "NetCyberAI Focus ढूँढें और Auto launch (Auto startup) चालू करें।",
        "autostart.TRANSSION" to "NetCyberAI Focus ढूँढें और Auto-start चालू करें।",
        "autostart.fallback" to "ऐप जानकारी खुलेगी। Autostart या Auto launch ढूँढें और चालू करें।",
        "battery.XIAOMI" to "No restrictions दबाएँ। (या: ऐप जानकारी, Battery saver, No restrictions)",
        "battery.SAMSUNG" to "ऐप जानकारी खुलेगी। Battery दबाएँ, फिर Unrestricted।",
        "battery.VIVO" to "ऐप जानकारी खुलेगी। Battery दबाएँ, फिर बैकग्राउंड में चलने की अनुमति दें।",
        "battery.COLOROS" to "ऐप जानकारी खुलेगी। Battery usage दबाएँ। Allow background activity और Allow auto launch चालू करें।",
        "battery.ONEPLUS" to "ऐप जानकारी खुलेगी। Battery दबाएँ, फिर Unrestricted (या Allow background activity)।",
        "battery.TRANSSION" to "ऐप जानकारी खुलेगी। Battery दबाएँ, फिर No restrictions। Phone Master में NetCyberAI Focus को सुरक्षित रखें।",
        "battery.STOCK" to "ऐप जानकारी खुलेगी। App battery usage दबाएँ, फिर Unrestricted।",
        "apps.title" to "कौन से ऐप बंद करने हैं",
        "apps.lead" to "पहले से चुने हैं: गेम, वीडियो, सोशल ऐप और ब्राउज़र। कॉल, मैसेज और NetCyberAI Family हमेशा खुले रहेंगे।",
        "apps.whatsapp" to "पढ़ाई के समय भी WhatsApp खुला रखें",
        "apps.none" to "बंद करने के लिए कम से कम एक ऐप चुनें।",
        "times.bad" to "कम से कम एक दिन चुनें, और शुरू का समय खत्म होने से पहले रखें।",
        "times.title" to "कब बंद करना है",
        "times.lead" to "पहले से तैयार: सोमवार से शुक्रवार, शाम 4 से रात 9 बजे तक। चाहें तो ही बदलें।",
        "times.from" to "से",
        "times.to" to "तक",
        "start" to "फ़ोकस लॉक शुरू करें",
        "start.missing" to "पहले ऊपर के कदम पूरे करें।",
        "home.on" to "फ़ोकस लॉक चालू है",
        "home.offTitle" to "फ़ोकस लॉक बंद है",
        "home.times" to "बंद रहेगा: {days}, {from} से {to} तक",
        "home.done" to "{name}: आज की पढ़ाई पूरी। ऐप खुले हैं।",
        "home.pending" to "{name}: आज {n} बाकी।",
        "home.unknown" to "NetCyberAI से आज की पढ़ाई की जानकारी का इंतज़ार है।",
        "home.change" to "सेटिंग बदलें",
        "home.turnOff" to "लॉक बंद करें",
        "home.turnOn" to "लॉक चालू करें",
        "home.refresh" to "फिर से देखें",
        "home.permLost" to "एक अनुमति बंद हो गई है। लॉक काम नहीं कर सकता। ठीक करने के लिए दबाएँ।",
        "home.removed" to "यह फ़ोन फ़ोकस लॉक से हटा दिया गया, या परिवार साइन आउट हो गया। NetCyberAI Family से फिर जोड़ें।",
        "home.parentOn" to "पेरेंट समय: {time} तक सब ऐप खुले हैं।",
        "home.lockNow" to "अभी बंद करें",
        "notif.channel" to "फ़ोकस लॉक",
        "notif.title" to "फ़ोकस लॉक चालू है",
        "notif.text" to "आज की पढ़ाई पूरी होने पर ऐप खुलेंगे।",
        "notif.fix" to "एक अनुमति बंद है। फ़ोकस लॉक ठीक करने के लिए दबाएँ।",
        "block.study" to "पहले पढ़ाई!",
        "block.studyName" to "{name}, पहले पढ़ाई!",
        "block.studyBody" to "NetCyberAI Family में आज की पढ़ाई पूरी करो। फिर यह ऐप अपने आप खुल जाएगा।",
        "block.left" to "आज अभी बाकी है:",
        "block.offline" to "इंटरनेट चालू करो, ताकि NetCyberAI आज की पढ़ाई देख सके।",
        "block.start" to "पढ़ाई शुरू करो",
        "block.pin" to "पेरेंट पिन",
        "block.home" to "वापस जाओ",
        "block.choose" to "फ़ोन कौन चला रहा है?",
        "block.limit" to "आज का समय पूरा हो गया",
        "block.limitBody" to "कल फिर आना। पेरेंट पिन से खोल सकते हैं।",
        "block.settings" to "पढ़ाई के समय बंद",
        "block.settingsBody" to "अभी सेटिंग, ऐप स्टोर और फ़ोन टूल के लिए पेरेंट पिन चाहिए।",
        "day.1" to "सोम", "day.2" to "मंगल", "day.3" to "बुध", "day.4" to "गुरु", "day.5" to "शुक्र", "day.6" to "शनि", "day.7" to "रवि",
    )

    fun t(lang: String, key: String, vararg args: Pair<String, Any>): String {
        var s = (if (lang == "hi") hi[key] else en[key]) ?: en[key] ?: key
        for ((k, v) in args) s = s.replace("{$k}", v.toString())
        return s
    }

    private fun family(b: Brand): String = when (b) {
        Brand.OPPO, Brand.REALME -> "COLOROS"
        Brand.MOTOROLA, Brand.PIXEL, Brand.NOTHING, Brand.OTHER -> "STOCK"
        else -> b.name
    }

    fun stepTitle(lang: String, kind: StepKind): String = when (kind) {
        StepKind.AUTOSTART -> t(lang, "perm.autostart.t")
        StepKind.BATTERY -> t(lang, "perm.battery.t")
        StepKind.BACKGROUND_POPUP -> t(lang, "perm.popup.t")
    }

    /** The words for a brand step; [ownScreen] is false when the brand's screen was not found and App info opens. */
    fun stepBody(lang: String, kind: StepKind, brand: Brand, ownScreen: Boolean): String = when (kind) {
        StepKind.BACKGROUND_POPUP -> t(lang, "perm.popup.b")
        StepKind.AUTOSTART -> {
            val f = if (brand == Brand.ONEPLUS) "COLOROS" else family(brand)
            if (ownScreen && f in setOf("XIAOMI", "VIVO", "COLOROS", "TRANSSION")) t(lang, "autostart.$f") else t(lang, "autostart.fallback")
        }
        StepKind.BATTERY -> t(lang, "battery.${family(brand)}")
    }

    /** 4:00 pm; in Hindi, the part of the day first (शाम 4:00), as people say it. */
    fun clock(lang: String, minuteOfDay: Int): String {
        val h = minuteOfDay / 60
        val m = (minuteOfDay % 60).toString().padStart(2, '0')
        val h12 = if (h % 12 == 0) 12 else h % 12
        if (lang == "hi") {
            val part = when { h < 12 -> "सुबह"; h < 16 -> "दोपहर"; h < 20 -> "शाम"; else -> "रात" }
            return "$part $h12:$m"
        }
        return "$h12:$m ${if (h < 12) "am" else "pm"}"
    }
}
