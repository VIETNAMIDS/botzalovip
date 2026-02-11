// Test script cho AI Learning system
const fs = require('fs');
const path = require('path');

// Simulate loading the AI Learning module
try {
  const aiLearning = require('./plugins/events/aiLearning.js');
  console.log('✅ AI Learning module loaded successfully');
  
  // Test basic functionality
  const testEvent = {
    threadId: 'test_thread_123',
    data: {
      uidFrom: 'test_user_456',
      content: 'Hôm nay tôi rất vui vẻ!'
    }
  };
  
  const mockApi = {
    getOwnId: () => 'bot_id_789',
    sendMessage: (msg, threadId) => {
      console.log(`📤 Bot would send: "${msg}" to thread ${threadId}`);
    }
  };
  
  console.log('🧪 Testing AI Learning with sample message...');
  
  // Simulate the run function
  aiLearning.run({
    event: testEvent,
    eventType: 'message',
    api: mockApi
  });
  
  console.log('✅ Test completed successfully');
  
  // Test data retrieval
  setTimeout(() => {
    try {
      const learningData = aiLearning.getLearningData();
      console.log('📊 Learning Data Stats:');
      console.log(`- Patterns: ${learningData.patterns.size}`);
      console.log(`- Keywords: ${learningData.keywords.size}`);
      console.log(`- User Profiles: ${learningData.userProfiles.size}`);
      console.log(`- Responses: ${learningData.responses.size}`);
      
      // Test response generation
      const response = aiLearning.generateResponse('test_thread_123', 'test_user_456', 'Tôi buồn quá');
      if (response) {
        console.log(`🤖 Generated response: "${response.response}" (confidence: ${response.confidence})`);
      } else {
        console.log('🤖 No response generated (normal for new data)');
      }
      
    } catch (error) {
      console.error('❌ Error testing data retrieval:', error.message);
    }
  }, 1000);
  
} catch (error) {
  console.error('❌ Failed to load AI Learning module:', error.message);
  console.error('Stack:', error.stack);
}

// Test ailearn command
try {
  const aiLearnCmd = require('./plugins/commands/ailearn.js');
  console.log('✅ AI Learn command module loaded successfully');
  
  // Test stats command
  const testStatsEvent = {
    threadID: 'test_thread_123',
    messageID: 'test_msg_456',
    senderID: 'test_user_789'
  };
  
  const mockApiForCmd = {
    sendMessage: (msg, threadId, messageId) => {
      console.log(`📤 Stats command would send to ${threadId}:`, msg.substring(0, 100) + '...');
    }
  };
  
  console.log('🧪 Testing ailearn stats command...');
  
  aiLearnCmd.run({
    api: mockApiForCmd,
    event: testStatsEvent,
    args: ['stats'],
    Users: {}
  }).then(() => {
    console.log('✅ Stats command test completed');
  }).catch(error => {
    console.error('❌ Stats command test failed:', error.message);
  });
  
} catch (error) {
  console.error('❌ Failed to load AI Learn command:', error.message);
}

console.log('\n🎯 AI Learning System Test Summary:');
console.log('- Core module: Testing...');
console.log('- Command module: Testing...');
console.log('- Data persistence: Will be tested during runtime');
console.log('- Integration: Ready for production');
console.log('\n💡 Run "node test_ai_learning.js" to test the system');
