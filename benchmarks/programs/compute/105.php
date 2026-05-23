<?php
$n=(int)trim(fgets(STDIN));
$s=0; $M=4294967291;
for($i=1;$i<=$n;$i++){ $s=($s*1000003+$i)%$M; }
echo "$s\n";
