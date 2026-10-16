!include "LogicLib.nsh"
!include "x64.nsh"
!macro NSIS_HOOK_PREINSTALL
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "Canapey Launcher nécessite Windows 11 x64."
    Abort
  ${EndIf}
  SetRegView 64
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Windows NT\CurrentVersion" "CurrentBuildNumber"
  ${If} $0 < 22000
    MessageBox MB_ICONSTOP "Canapey Launcher nécessite Windows 11 x64."
    Abort
  ${EndIf}
!macroend
