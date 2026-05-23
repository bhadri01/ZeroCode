$n = [long][Console]::In.ReadLine()
$s = [long]0
$m = [long]4294967291
for ($i = [long]1; $i -le $n; $i++) {
    $s = ($s * 1000003 + $i) % $m
}
Write-Output $s
