import Workbench from './workbench';
import { requireChatGPTUser } from './chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = await requireChatGPTUser('/');
  return <Workbench displayName={user.fullName || user.email} />;
}
