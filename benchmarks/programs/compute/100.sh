read n
s=0; M=4294967291
for ((i=1;i<=n;i++)); do s=$(( (s*1000003 + i) % M )); done
echo "$s"
