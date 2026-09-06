import { ConnectWallet } from "@/components/wallet/connect-wallet";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center gap-6 bg-zinc-50 font-sans dark:bg-black">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        ensvillage
      </h1>
      <ConnectWallet />
    </div>
  );
}
