#Requires AutoHotkey v2.0
#SingleInstance Force
Persistent(true)
A_IconTip := "Ice Pack ARK v0.7.1 - Manual mode"
; Set to your actual ARK console binding. Default: grave/tilde physical key.
consoleKey := "{vkC0}"
autoOn := false
busy := false
stopRequested := false

Request(path, mode := "", id := "", outcome := "") {
    req := ComObject("WinHttp.WinHttpRequest.5.1")
    req.SetTimeouts(300, 300, 300, 700)
    req.Open("POST", "http://127.0.0.1:3210/bridge/" path, false)
    req.SetRequestHeader("X-Ice-Pack", "1")
    if mode != ""
        req.SetRequestHeader("X-Mode", mode)
    if id != ""
        req.SetRequestHeader("X-Job-Id", id)
    if outcome != ""
        req.SetRequestHeader("X-Outcome", outcome)
    req.Send()
    return req
}
StopAuto(notify := true, reason := "Automatic mode stopped") {
    global autoOn, stopRequested
    autoOn := false
    stopRequested := true
    SetTimer(Pump, 0)
    if notify {
        try Request("auto-off")
    }
    A_IconTip := "Ice Pack ARK v0.7.1 - Manual mode"
    ShowStatus(reason)
    SoundBeep(400, 100)
}
Safe(id) {
    global autoOn, stopRequested
    if !autoOn || stopRequested || !WinActive("ahk_exe ArkAscended.exe")
        return false
    return Request("check", "", id).Status = 200 && autoOn && !stopRequested && WinActive("ahk_exe ArkAscended.exe")
}
Deliver(mode) {
    global busy, autoOn, consoleKey
    if busy
        return
    busy := true
    id := ""
    try {
        if !WinActive("ahk_exe ArkAscended.exe") {
            if mode = "auto"
                StopAuto(true, "ARK lost focus. Re-permit auto in dashboard, then F9.")
            return
        }
        req := Request("claim", mode)
        if req.Status != 200
            throw Error("Claim HTTP " req.Status)
        if mode = "auto" && req.GetResponseHeader("X-Auto-Enabled") != "1" {
            StopAuto(false, "Automatic mode not permitted. Enable it in dashboard, then F9.")
            return
        }
        cmd := req.ResponseText
        if cmd = ""
            return
        id := req.GetResponseHeader("X-Job-Id")
        if !RegExMatch(cmd, "^cheat SpawnDino " Chr(34) "Blueprint'/Game/PrimalEarth/Dinos/(Dodo|Raptor|Rex|Carno|Dilo)/\1_Character_BP\.\1_Character_BP'" Chr(34) " [0-9]{3,4} 0 0 [0-9]{1,3}$")
            throw Error("Unexpected command rejected")
        if mode = "auto" {
            if !Safe(id)
                throw Error("Stopped before opening console")
            Send(consoleKey)
            Sleep(350)
            if !Safe(id)
                throw Error("Stopped before typing; inspect console")
            SendText(cmd)
            Sleep(150)
            if !Safe(id)
                throw Error("Stopped before Enter; inspect console")
            Send("{Enter}")
            ; ARK may leave the console open. Confirm behavior on your machine.
            Sleep(400)
            outcome := "submitted"
        } else {
            if !WinActive("ahk_exe ArkAscended.exe")
                throw Error("ARK lost focus")
            SendText(cmd)
            outcome := "typed"
        }
        if Request("ack", "", id, outcome).Status != 200
            throw Error("Acknowledgement failed; do not retry blindly")
        SoundBeep(900, 70)
    } catch as e {
        if id != "" {
            try Request("ack", "", id, "failed")
        }
        StopAuto()
        ShowStatus(e.Message)
    } finally {
        busy := false
    }
}
ShowStatus(message) {
    ToolTip("Ice Pack: " message)
    SetTimer(ClearStatus, -4000)
}
ClearStatus() {
    ToolTip()
}
Pump() {
    global autoOn
    if autoOn
        Deliver("auto")
}
#HotIf WinActive("ahk_exe ArkAscended.exe")
F8:: {
    global autoOn
    if autoOn
        StopAuto()
    Deliver("manual")
}
F9:: {
    global autoOn, stopRequested
    if autoOn {
        StopAuto()
        return
    }
    stopRequested := false
    autoOn := true
    A_IconTip := "Ice Pack ARK v0.7.1 - Auto mode"
    ShowStatus("Auto enabled locally. Waiting for queued commands.")
    SoundBeep(1000, 100)
    SetTimer(Pump, 2000)
}
#HotIf
F10::StopAuto()
F7:: {
    global autoOn
    ShowStatus("Bridge running | " (autoOn ? "Auto mode" : "Manual mode") " | ARK " (WinActive("ahk_exe ArkAscended.exe") ? "active" : "not active"))
}
