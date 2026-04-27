import * as z from "zod/mini";

export type RsvpDataConfig = {
    topic: string;
    datetime: string;
    invitees: number[];
    current_user_id: number;
    call_url?: string | undefined;
    call_type?: "video" | "voice" | undefined;
}

export const rsvp_widget_extra_data_schema = z.object({
    topic: z.string(),
    datetime: z.string(),          // ISO-8601
    invitees: z.array(z.number()), // user_ids
    call_url: z.optional(z.string()),
    call_type: z.optional(z.enum(["video", "voice"])),
});
export type RsvpWidgetExtraData = z.infer<typeof rsvp_widget_extra_data_schema>;

export const vote_schema = z.object({
    type: z.literal("vote"),
    status: z.enum(["accept", "tentative", "decline"]),
});
export type RsvpVote = z.infer<typeof vote_schema>;
export type RsvpOutboundData = RsvpVote;

export type RsvpResponse = "accept" | "tentative" | "decline";

export class RsvpData {
    topic: string;
    datetime: string;
    invitees: number[];
    call_url: string | undefined;
    call_type: "video" | "voice" | undefined;
    // Maps user_id → their response
    responses = new Map<number, RsvpResponse>();
    me: number;

    constructor({
        topic,
        datetime,
        invitees,
        current_user_id,
        call_url,
        call_type,
    }: RsvpDataConfig) {
        this.topic = topic;
        this.datetime = datetime;
        this.invitees = invitees;
        this.me = current_user_id;
        this.call_url = call_url;
        this.call_type = call_type;
    }

    handle_vote_event(sender_id: number, data: RsvpVote): void {
        this.responses.set(sender_id, data.status);
    }

    vote_event(status: RsvpResponse): RsvpVote {
        return { type: "vote", status };
    }

    get_widget_data() {
        const buckets: Record<RsvpResponse, number[]> = {
            accept: [],
            tentative: [],
            decline: [],
        };
        for (const [uid, status] of this.responses) {
            buckets[status].push(uid);
        }
        return {
            topic: this.topic,
            datetime: this.datetime,
            invitees: this.invitees,
            buckets,
            my_response: this.responses.get(this.me),
            call_url: this.call_url,
            call_type: this.call_type,
        };
    }
}