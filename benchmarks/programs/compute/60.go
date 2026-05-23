package main
import "fmt"
func main(){
  var n int64; fmt.Scan(&n)
  var s int64 = 0; const M int64 = 4294967291
  for i:=int64(1); i<=n; i++ { s=(s*1000003+i)%M }
  fmt.Println(s)
}
