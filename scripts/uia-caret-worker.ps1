# Long-lived UI Automation probe for Persian Speach Type.
# Commands (stdin, one per line):
#   probe  -> JSON line with editable focus info
#   quit   -> exit
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
[Console]::Out.WriteLine('READY')
[Console]::Out.Flush()

function Probe-Editable {
  $el = [System.Windows.Automation.AutomationElement]::FocusedElement
  if (-not $el) {
    return @{ editable = $false; reason = 'no-focus' }
  }
  $c = $el.Current
  $hasText = $false
  try {
    $null = $el.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
    $hasText = $true
  } catch {}

  $hasEditableValue = $false
  try {
    $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    if ($vp -and -not $vp.Current.IsReadOnly) {
      $hasEditableValue = $true
    }
  } catch {}

  $typeName = $c.ControlType.ProgrammaticName
  $isEditType = @('ControlType.Edit', 'ControlType.Document') -contains $typeName
  $isEditableCombo =
    ($typeName -eq 'ControlType.ComboBox') -and ($hasText -or $hasEditableValue)

  $editable = [bool](
    ($isEditType -or $isEditableCombo -or $hasText -or $hasEditableValue) -and
    $c.IsKeyboardFocusable
  )

  if (-not $editable -and $hasText -and $c.IsKeyboardFocusable) {
    $editable = $true
  }

  return @{
    editable = $editable
    controlType = $typeName
    focusable = [bool]$c.IsKeyboardFocusable
    textPattern = $hasText
    editableValue = $hasEditableValue
    reason = $(if ($editable) { 'uia-editable' } else { 'not-editable' })
  }
}

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  $cmd = $line.Trim().ToLowerInvariant()
  if ($cmd -eq 'quit') { break }
  if ($cmd -ne 'probe') { continue }
  try {
    $result = Probe-Editable
    ($result | ConvertTo-Json -Compress) | ForEach-Object {
      [Console]::Out.WriteLine($_)
      [Console]::Out.Flush()
    }
  } catch {
    $err = @{ editable = $false; reason = 'exception' } | ConvertTo-Json -Compress
    [Console]::Out.WriteLine($err)
    [Console]::Out.Flush()
  }
}
