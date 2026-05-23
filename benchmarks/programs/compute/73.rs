use std::io::Read;
fn main(){
  let mut t=String::new();
  std::io::stdin().read_to_string(&mut t).unwrap();
  let n:i64=t.trim().parse().unwrap();
  let m:i64=4294967291; let mut s:i64=0;
  for i in 1..=n { s=(s*1000003+i)%m; }
  println!("{}", s);
}
