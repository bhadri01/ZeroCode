my $n = get.Int;
my $m = 4294967291;
my $s = 0;
for 1..$n -> $i {
    $s = ($s * 1000003 + $i) % $m;
}
say $s;
