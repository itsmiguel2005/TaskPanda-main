import ChatLayout from "../components/ChatLayout.jsx";

const conversations = [
  {
    id: 1,
    name: "Ana Reyes",
    cred: "Licensed Electrician",
    task: "Leaking Pipe Fix",
    lastMessage: "Thank you, much appreciated!",
    time: "10:32 AM",
    unread: true,
  },
  {
    id: 2,
    name: "Carlos Magsaysay",
    cred: "Furniture Assembler",
    task: "Bookshelf Assembly",
    lastMessage: "Sounds good, see you tomorrow.",
    time: "Yesterday",
    unread: true,
  },
  {
    id: 3,
    name: "Miguel Torres",
    cred: "Carpenter",
    task: "Desktop Table Repair",
    lastMessage: "The table is fixed perfectly.",
    time: "Sep 10",
    unread: false,
  },
];

const messagesData = {
  1: [
    { id: 1, sender: "client", text: "Hi, my kitchen sink pipe is leaking badly.", time: "Sep 14, 9:00 AM" },
    { id: 2, sender: "me", text: "Hi Ana, I can help with that. When would you like me to come?", time: "Sep 14, 9:15 AM" },
    { id: 3, sender: "client", text: "Tomorrow morning would be great. Any time after 10?", time: "Sep 14, 9:22 AM" },
    { id: 4, sender: "me", text: "I'm available from 10:00 AM. I'll be there.", time: "Sep 14, 9:25 AM" },
    { id: 5, sender: "client", text: "Thank you, much appreciated!", time: "Sep 14, 9:32 AM" },
  ],
  2: [
    { id: 1, sender: "client", text: "Hi, I need help assembling a bookshelf.", time: "Sep 13, 2:00 PM" },
    { id: 2, sender: "me", text: "Sure, I can do that. All parts included?", time: "Sep 13, 2:10 PM" },
    { id: 3, sender: "client", text: "Yes, all parts are included. 5-tier shelf.", time: "Sep 13, 2:15 PM" },
    { id: 4, sender: "me", text: "Sounds good, see you tomorrow.", time: "Sep 13, 2:20 PM" },
    { id: 5, sender: "client", text: "Sounds good, see you tomorrow.", time: "Sep 13, 3:00 PM" },
  ],
  3: [
    { id: 1, sender: "client", text: "Hi, can you fix my desktop table?", time: "Sep 8, 10:15 AM" },
    { id: 2, sender: "me", text: "Sure, broken leg needs reinforcement?", time: "Sep 8, 10:20 AM" },
    { id: 3, sender: "client", text: "Yes, wood glue and screw repair.", time: "Sep 8, 10:22 AM" },
    { id: 4, sender: "me", text: "Done! The table is fixed perfectly.", time: "Sep 9, 9:00 AM" },
    { id: 5, sender: "client", text: "The table is fixed perfectly.", time: "Sep 9, 10:15 AM" },
  ],
};

export default function ProviderMessagesPage() {
  return (
    <ChatLayout
      conversations={conversations}
      messagesData={messagesData}
      headerSubtitle="Client"
      avatarTheme="accent"
      senderMe="me"
      senderOther="client"
      otherRoleLabel="Client"
    />
  );
}
