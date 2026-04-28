import { z } from "zod";

export const availability_schema = z.object({
    type: z.literal("availability_submitted"),
    user_id: z.number(),
});

export const propose_widget_extra_data_schema = z.object({
    meeting_id: z.number(),
    topic: z.string(),
    invitees: z.array(z.number()).optional(),
    call_url: z.string().optional(),
    call_type: z.enum(["video", "voice"]).optional(),
});

export type AvailabilityEvent = z.infer<typeof availability_schema>;

type ProposeDataParams = {
    meeting_id: number;
    topic: string;
    invitees: number[];
    current_user_id: number;
    call_url?: string | undefined;
    call_type?: "video" | "voice" | undefined;
};

export class ProposeData {
    meeting_id: number;
    topic: string;
    invitees: number[];
    me: number;
    call_url: string | undefined;
    call_type: "video" | "voice" | undefined;

    // set of user_ids who have submitted availability
    submitted: Set<number>;

    constructor({ meeting_id, topic, invitees, current_user_id, call_url, call_type }: ProposeDataParams) {
        this.meeting_id = meeting_id;
        this.topic = topic;
        this.invitees = invitees;
        this.me = current_user_id;
        this.call_url = call_url;
        this.call_type = call_type;
        this.submitted = new Set();
    }

    handle_availability_event(sender_id: number, _event: AvailabilityEvent): void {
        this.submitted.add(sender_id);
    }

    has_submitted(user_id: number): boolean {
        return this.submitted.has(user_id);
    }

    get_widget_data(): {
        meeting_id: number;
        topic: string;
        invitees: number[];
        submitted: Set<number>;
        i_have_submitted: boolean;
        call_url: string | undefined;
        call_type: "video" | "voice" | undefined;
    } {
        return {
            meeting_id: this.meeting_id,
            topic: this.topic,
            invitees: this.invitees,
            submitted: this.submitted,
            i_have_submitted: this.submitted.has(this.me),
            call_url: this.call_url,
            call_type: this.call_type,
        };
    }

    availability_event(): AvailabilityEvent {
        return {
            type: "availability_submitted",
            user_id: this.me,
        };
    }
}