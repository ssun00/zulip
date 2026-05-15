# Zulip Meeting Scheduler Feature – User Manual

## Overview

The Meeting Scheduler feature in Zulip allows users to seamlessly propose meetings, invite participants, and manage responses directly within conversations. This decreases the amount of back-and-forth communication and centralizes scheduling workflows.

This guide explains how to use the feature based on your role and the key workflows:

- Creating an RSVP meeting (Organizer)
- Responding to an RSVP meeting (Invitee)
- Proposing a meeting (Organizer)
- Submitting availability (Invitee)
- Viewing all submitted availability (Organizer)

## User Roles

### Organizer

An Organizer is the user who creates and sends meeting invitations and proposals. They are responsible for:

- Defining meeting details (time, duration, description)
- Selecting invitees
- Monitoring responses
- Finalizing the meeting

### Invitee

An Invitee is a user who receives a meeting invitation. They are responsible for:

- Viewing meeting details
- Responding with availability
- Updating their response if needed

## Key Concepts

- **Meeting Proposal:** A structured message sent in a Zulip stream containing meeting details
- **RSVP Meeting:** Organizer knows date and time of meeting and wants to confirm Invitees' RSVP responses
- **Propose a Meeting:** Organizer has a range of dates and times for a meeting and wants to know Invitees' availability
- **RSVP:** Response indicates availability of Invitee (Accept, Decline, Tentative)
- **Submit Availability:** Response similar to a When2Meet where Invitees submit their availability and can edit until RSVP deadline
- **Finalize Meeting:** Organizer can view Invitees' availability and finalize a date and time for their proposed meeting

## Workflow 1: Create an RSVP Meeting (Organizer)

### Step 1: Open the RSVP Meeting Modal

- Navigate to the desired Zulip stream/channel
- Click the Plus Calendar icon in the message composer
- Select the **RSVP Meeting** option

### Step 2: Enter Meeting Details

Fill out the following fields:

- **Topic:** Name/topic of the meeting
- **Date and Time:** Set meeting date and time
- **Invitees:** Select users to include
- **Create New Channel (optional):** Option to create a new channel specific to this meeting
  - Automatically creates a new channel if a user from outside the current channel is invited
- **Add Video/Voice Call (optional):** Option to add a video or voice call link to the meeting message

### Step 3: Send RSVP Meeting

- Click **Submit**
- A structured meeting message will appear in the conversation

### Step 4: Track Responses

View RSVP statuses directly within the message:

- Accept
- Decline
- Tentative

Responses update in real-time as invitees reply.

## Workflow 2: RSVP to a Meeting (Invitee)

### Step 1: View RSVP Meeting Invitation

- Locate the meeting message in your Zulip conversation
- You will be notified if you have been invited
- Review:
  - Topic
  - Date and time
  - Organizer
  - Other participants and their responses
  - Voice/video call link

### Step 2: Select Your Availability

Choose one of the RSVP options:

- **Accept:** You are available
- **Decline:** You are not available
- **Tentative:** Uncertain availability

Your response will be reflected in the meeting message.

### Step 3: Update Response (Optional)

- You may change your RSVP at any time
- Updates are reflected immediately

## Workflow 3: Propose a Meeting (Organizer)

### Step 1: Open the Propose a Meeting Modal

- Navigate to the desired Zulip stream/channel
- Click the Plus Calendar icon in the message composer
- Select the **Propose a Meeting** option

### Step 2: Enter Meeting Details

Fill out the following fields:

- **Topic:** Name/topic of the meeting
- **Proposed Date(s):** One or more date slots
- **Proposed Time(s):** One or more time slots
  - Times will reflect for all the proposed dates
- **Invitees:** Select users to include
- **RSVP By Date:** Set a date and time for Invitees to submit availability by
- **Create New Channel (optional):** Option to create a new channel specific to this meeting
  - Automatically creates a new channel if a user from outside the current channel is invited
- **Add Video/Voice Call (optional):** Option to add a video or voice call link to the meeting message

### Step 3: Send Proposed Meeting

- Click **Submit**
- A structured meeting message will appear in the conversation

### Step 4: Track Responses

- View Invitees' availability directly within the message by clicking on **View Availability**
- A list of dates and times sorted by which has the most Invitees' availability will be shown

### Step 5: Finalize Meeting Date and Time

- Select a final date and time for your proposed meeting based on availability responses
- A finalized message with the selected date and time will be sent to the channel
- You will be able to select a final date and time even before the RSVP by date

## Workflow 4: Submit Availability to Proposed Meeting (Invitee)

### Step 1: View Meeting Proposal

- Locate the meeting message in your Zulip conversation
- You will be notified if you have been invited
- Review:
  - Topic
  - Proposed date(s) and time(s)
  - Organizer
  - Other participants
  - Voice/video call link

### Step 2: Select Your Availability

- Click on **Submit Availability**
- Similar to a When2Meet flow, click or click-and-drag on time slots for each date that you are available

### Step 3: Submit Availability

- Click **Submit**
- Your response will be reflected to the Organizer

### Step 4: Update Availability (Optional)

- You may change your availability at any time before the RSVP by date or before the meeting is finalized
- Updates are reflected immediately to the Organizer
