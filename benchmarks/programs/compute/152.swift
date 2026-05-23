let n = Int(readLine()!)!
let m = 4294967291
var s = 0, i = 1
while i <= n { s = (s * 1000003 + i) % m; i += 1 }
print(s)
