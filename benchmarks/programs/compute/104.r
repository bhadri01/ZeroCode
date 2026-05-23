n <- as.numeric(readLines("stdin", n=1))
s <- 0; M <- 4294967291
for (i in 1:n) s <- (s*1000003 + i) %% M
cat(sprintf("%.0f\n", s))
