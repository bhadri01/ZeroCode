fs = require 'fs'
n = Number fs.readFileSync(0, 'utf8').trim()
s = 0
m = 4294967291
i = 1
while i <= n
  s = (s * 1000003 + i) % m
  i++
console.log s
