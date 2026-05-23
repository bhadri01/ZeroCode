import sys
n=int(sys.stdin.read().strip())
s=0; M=4294967291
for i in range(1,n+1): s=(s*1000003+i)%M
print(s)
