Dim As LongInt n
Input n
Dim As LongInt s = 0, m = 4294967291, i
For i = 1 To n
  s = (s * 1000003 + i) Mod m
Next
Print s
