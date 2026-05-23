import os

fn main() {
	n := os.input('').i64()
	mut s := i64(0)
	m := i64(4294967291)
	for i := i64(1); i <= n; i++ {
		s = (s * 1000003 + i) % m
	}
	println(s)
}
