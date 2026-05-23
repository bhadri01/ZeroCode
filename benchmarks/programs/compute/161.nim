import strutils
let n = stdin.readLine().strip().parseInt()
var s: int64 = 0
let m: int64 = 4294967291
for i in 1..n:
  s = (s * 1000003 + i) mod m
echo s
