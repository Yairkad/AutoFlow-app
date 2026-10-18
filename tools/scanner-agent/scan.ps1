# -list            → prints one line per WIA scanner: DEV:<DeviceID>|<Name>
# otherwise         → scans with -device (DeviceID; empty = the only scanner) into JPEG pages
#                     p001.jpg, p002.jpg, ... in $out.
# source: auto (feeder if it has paper, else glass) | feeder | flatbed
# Prints OK:<pages> or ERR:<code>:<detail>
param([string]$out, [string]$source = 'auto', [int]$dpi = 200, [string]$device = '', [switch]$list)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8   # Hebrew device names

function SetProp($props, $id, $val) { foreach ($p in $props) { if ($p.PropertyID -eq $id) { try { $p.Value = $val } catch {} } } }
function GetProp($props, $id) { foreach ($p in $props) { if ($p.PropertyID -eq $id) { return $p.Value } }; return $null }

$JPEG = '{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}'
$FEEDER = 1; $FLATBED = 2

try { $dm = New-Object -ComObject WIA.DeviceManager } catch { Write-Output 'ERR:NO_WIA:'; exit 2 }
$scanners = @()
foreach ($d in $dm.DeviceInfos) { if ($d.Type -eq 1) { $scanners += $d } }   # 1 = scanner
function DevName($d) { try { return [string]$d.Properties.Item('Name').Value } catch { return [string]$d.DeviceID } }

if ($list) {
  foreach ($d in $scanners) { Write-Output ('DEV:' + $d.DeviceID + '|' + (DevName $d)) }
  Write-Output 'OK:list'
  exit 0
}

if ($scanners.Count -eq 0) { Write-Output 'ERR:NO_SCANNER:'; exit 2 }
$info = $null
if ($device) { foreach ($d in $scanners) { if ($d.DeviceID -eq $device) { $info = $d } } }
elseif ($scanners.Count -eq 1) { $info = $scanners[0] }
if (-not $info) { Write-Output 'ERR:DEVICE_NOT_FOUND:'; exit 2 }
$name = DevName $info
try { $dev = $info.Connect() } catch {
  $hr = '{0:X8}' -f $_.Exception.HResult
  if ($hr -eq '80210006') { Write-Output ('ERR:BUSY:' + $name); exit 4 }
  Write-Output ('ERR:CONNECT:' + $name); exit 3
}

$caps = GetProp $dev.Properties 3086      # document handling capabilities
$status = GetProp $dev.Properties 3087    # document handling status (1 = feed ready)
$hasFeeder = ($caps -ne $null) -and (($caps -band $FEEDER) -ne 0)

# Order of paper sources to try. Some drivers (e.g. Brother) report "feed ready" even when the
# feeder is empty, so in auto mode an empty first source falls through to the next one.
if ($source -eq 'feeder') { $modes = @($FEEDER) }
elseif ($source -eq 'flatbed') { $modes = @($FLATBED) }
elseif ($hasFeeder -and ($status -ne $null) -and (($status -band 1) -ne 0)) { $modes = @($FEEDER, $FLATBED) }
elseif ($hasFeeder) { $modes = @($FLATBED, $FEEDER) }
else { $modes = @($FLATBED) }
Write-Output ("INFO:device=$name caps=$caps status=$status modes=" + ($modes -join ','))

$item = $dev.Items.Item(1)
SetProp $item.Properties 6146 1       # colour
SetProp $item.Properties 6147 $dpi    # horizontal dpi
SetProp $item.Properties 6148 $dpi    # vertical dpi

$n = 0
for ($m = 0; $m -lt $modes.Count; $m++) {
  $useFeeder = ($modes[$m] -eq $FEEDER)
  SetProp $dev.Properties 3088 $modes[$m]
  if ($useFeeder) { SetProp $dev.Properties 3096 1 }   # one page per transfer
  Write-Output ('INFO:try ' + $(if ($useFeeder) { 'feeder' } else { 'flatbed' }) + ' (3088=' + (GetProp $dev.Properties 3088) + ')')
  $emptyFirst = $false
  while ($true) {
    try { $img = $item.Transfer($JPEG) }
    catch {
      if ($useFeeder -and $n -gt 0) { break }   # feeder emptied after the last page
      $hr = '{0:X8}' -f $_.Exception.HResult
      Write-Output ("INFO:transfer failed $hr")
      if ($hr -eq '80210003') { $emptyFirst = $true; break }
      if ($hr -eq '80210006') { Write-Output ('ERR:BUSY:' + $name); exit 4 }
      if ($hr -eq '80210005') { Write-Output ('ERR:OFFLINE:' + $name); exit 4 }
      if ($hr -eq '80210002') { Write-Output 'ERR:PAPER_JAM:'; exit 4 }
      Write-Output ('ERR:SCAN:' + $hr + ' ' + $_.Exception.Message); exit 5
    }
    if ($img.FormatID -ne $JPEG) {
      $ip = New-Object -ComObject WIA.ImageProcess
      $ip.Filters.Add($ip.FilterInfos.Item('Convert').FilterID)
      $ip.Filters.Item(1).Properties.Item('FormatID').Value = $JPEG
      $ip.Filters.Item(1).Properties.Item('Quality').Value = 85
      $img = $ip.Apply($img)
    }
    $n++
    $img.SaveFile((Join-Path $out ('p{0:D3}.jpg' -f $n)))
    if (-not $useFeeder -or $n -ge 60) { break }
  }
  if ($n -gt 0) { break }            # got pages from this source
  if (-not $emptyFirst) { break }
}
if ($n -eq 0) { Write-Output 'ERR:PAPER_EMPTY:'; exit 4 }
Write-Output "OK:$n"
