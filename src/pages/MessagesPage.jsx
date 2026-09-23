import ChatLayout from "../components/ChatLayout.jsx";

const conversations = [
  {
    id: 1,
    name: "Johhny Cruz",
    cred: "TESDA NC II Carpenter",
    task: "Desktop Table Repair",
    lastMessage: "Sure, I can come tomorrow. See you at 9am!",
    time: "10:32 AM",
    unread: true,
  },
  {
    id: 2,
    name: "Maria Santos",
    cred: "TESDA NC II Electrician",
    task: "Circuit Breaker Replacement",
    lastMessage: "The part is available. Ready to schedule.",
    time: "Yesterday",
    unread: true,
  },
  {
    id: 3,
    name: "Ricky Padilla",
    cred: "Licensed Landscaper",
    task: "Front Yard Landscaping",
    lastMessage: "Thank you! Leave a review after completion.",
    time: "Sep 10",
    unread: false,
  },
];

const messagesData = {
  1: [
    { id: 1, sender: "worker", text: "Hi! I received your request for the desktop table repair.", time: "Sep 8, 10:15 AM" },
    { id: 2, sender: "me", text: "Great! Can you come tomorrow morning?", time: "Sep 8, 10:22 AM" },
    { id: 3, sender: "worker", text: "Sure, I can come tomorrow. See you at 9am!", time: "Sep 8, 10:32 AM" },
  ],
  2: [
    { id: 1, sender: "worker", text: "Hello, I checked your circuit breaker issue.", time: "Sep 7, 2:00 PM" },
    { id: 2, sender: "me", text: "What parts do you need?", time: "Sep 7, 3:15 PM" },
    { id: 3, sender: "worker", text: "The part is available. Ready to schedule.", time: "Sep 7, 3:45 PM" },
  ],
  3: [
    { id: 1, sender: "worker", text: "Landscaping is complete! Front yard looks great.", time: "Sep 5, 12:30 PM" },
    { id: 2, sender: "me", text: "Thank you! Looks amazing.", time: "Sep 5, 1:00 PM" },
    { id: 3, sender: "worker", text: "Thank you! Leave a review after completion.", time: "Sep 5, 1:15 PM" },
  ],
};

export default function MessagesPage() {
  return (
    <ChatLayout
      conversations={conversations}
      messagesData={messagesData}
      headerSubtitle={(conv) => conv.cred}
      avatarTheme="primary"
      senderMe="me"
      senderOther="worker"
      otherRoleLabel="Worker"
    />
  );
}
