{ n = $1 }
END {
  m = 4294967291; s = 0;
  for (i = 1; i <= n; i++) s = (s * 1000003 + i) % m;
  printf "%.0f\n", s;
}
