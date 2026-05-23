#include <stdio.h>
int main(void){
  long long n; if(scanf("%lld",&n)!=1) return 1;
  long long s=0, M=4294967291LL;
  for(long long i=1;i<=n;i++) s=(s*1000003+i)%M;
  printf("%lld\n", s);
  return 0;
}
