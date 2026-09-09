import { createRpcBinding } from "@nat-av/framework-remix";
import type { natav } from "@/server/index";

const rpcBinding = await createRpcBinding<natav>();

export const getRpc = rpcBinding.getRpc;
