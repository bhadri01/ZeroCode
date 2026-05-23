#include <iostream>
int main(){
  long long n; std::cin>>n;
  long long s=0, M=4294967291LL;
  for(long long i=1;i<=n;i++) s=(s*1000003+i)%M;
  std::cout<<s<<"\n";
}
