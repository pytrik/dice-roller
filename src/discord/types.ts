/** Minimal structural types for the interaction payloads we handle.
 *  Not exhaustive — add fields as you need them. */

export interface InteractionUser {
  id: string;
  username: string;
  global_name?: string | null;
}

export interface InteractionOption {
  name: string;
  type: number;
  value?: string | number | boolean;
  focused?: boolean;
  options?: InteractionOption[];
}

export interface Interaction {
  id: string;
  type: number;
  application_id: string;
  token: string;
  guild_id?: string;
  channel_id?: string;
  /** Present for guild interactions. */
  member?: { user: InteractionUser };
  /** Present for DM interactions. */
  user?: InteractionUser;
  data?: {
    id: string;
    name: string;
    type: number;
    options?: InteractionOption[];
  };
}

/** Interactions arrive from a guild (member) or a DM (user). */
export function invokingUser(interaction: Interaction): InteractionUser | undefined {
  return interaction.member?.user ?? interaction.user;
}

export function getOption(
  interaction: Interaction,
  name: string,
): string | number | boolean | undefined {
  return interaction.data?.options?.find((o) => o.name === name)?.value;
}
