local n=math.tointeger(tonumber(io.read("*l")))
local s=0; local M=4294967291
for i=1,n do s=(s*1000003+i)%M end
print(s)
