use integer;
my $n=<STDIN>; chomp $n;
my $s=0; my $M=4294967291;
for(my $i=1;$i<=$n;$i++){ $s=($s*1000003+$i)%$M; }
print "$s\n";
