// Advanced test file for auto join Zalo group functionality
const fs = require('fs');
const path = require('path');

// Import the autojoin module
const autoJoinModule = require('./plugins/commands/autojoin.js');

// Mock API object for testing
const mockAPI = {
  sendMessage: async (messageData, threadId, type) => {
    console.log(`📤 Mock API - Sending message to ${threadId}:`);
    console.log(`   Message: ${messageData.msg || messageData}`);
    if (messageData.mentions) {
      console.log(`   Mentions: ${messageData.mentions.length} users`);
    }
    return { success: true, messageId: `mock_${Date.now()}` };
  },
  
  joinGroup: async (groupId) => {
    console.log(`🔗 Mock API - Attempting to join group: ${groupId}`);
    // Simulate success for test groups
    if (groupId.includes('test') || groupId.includes('demo')) {
      return { success: true, groupId, joined: true };
    }
    throw new Error('Group not found or access denied');
  },
  
  getCurrentUserId: () => 'mock_bot_id_123'
};

// Mock Threads object for testing
const mockThreads = {
  getData: async (threadId) => {
    return {
      data: {
        auto_join: true,
        anti_link: false,
        anti_spam: false
      }
    };
  },
  
  setData: async (threadId, data) => {
    console.log(`💾 Mock Threads - Saving data for ${threadId}:`, data);
    return true;
  }
};

// Test cases for auto join detection
const testCases = [
  {
    name: "Zalo Group Link (Standard)",
    content: "Tham gia nhóm này nhé: https://zalo.me/g/testgroup123",
    expectedDetections: 1,
    expectedTypes: ["ZALO_GROUP"]
  },
  {
    name: "Zalo Invite Link",
    content: "Link mời: https://zalo.me/s/invite456",
    expectedDetections: 1,
    expectedTypes: ["ZALO_INVITE"]
  },
  {
    name: "Multiple Zalo Links",
    content: "Group 1: https://zalo.me/g/group1 và Group 2: https://zalo.me/g/group2",
    expectedDetections: 2,
    expectedTypes: ["ZALO_GROUP", "ZALO_GROUP"]
  },
  {
    name: "Mixed Platform Links",
    content: "Zalo: https://zalo.me/g/test123 Discord: https://discord.gg/test456 Telegram: https://t.me/testgroup",
    expectedDetections: 3,
    expectedTypes: ["ZALO_GROUP", "DISCORD_INVITE", "TELEGRAM_GROUP"]
  },
  {
    name: "No Auto Join Links",
    content: "Chỉ là tin nhắn bình thường với link https://google.com",
    expectedDetections: 0,
    expectedTypes: []
  },
  {
    name: "Zalo Link Without Protocol",
    content: "Tham gia: zalo.me/g/noprotocol",
    expectedDetections: 1,
    expectedTypes: ["ZALO_GROUP"]
  }
];

// Test function for link detection
async function testLinkDetection() {
  console.log("🧪 Testing Auto Join Link Detection...\n");
  
  let passedTests = 0;
  let totalTests = testCases.length;
  
  for (let i = 0; i < testCases.length; i++) {
    const testCase = testCases[i];
    console.log(`Test ${i + 1}: ${testCase.name}`);
    console.log(`Input: "${testCase.content}"`);
    
    try {
      const detected = autoJoinModule.detectAutoJoinLinks(testCase.content);
      const detectedTypes = detected.map(d => d.type);
      
      console.log(`Expected: ${testCase.expectedDetections} links, types: [${testCase.expectedTypes.join(', ')}]`);
      console.log(`Detected: ${detected.length} links, types: [${detectedTypes.join(', ')}]`);
      
      const correctCount = detected.length === testCase.expectedDetections;
      const correctTypes = JSON.stringify(detectedTypes.sort()) === JSON.stringify(testCase.expectedTypes.sort());
      
      if (correctCount && correctTypes) {
        console.log("✅ PASS\n");
        passedTests++;
      } else {
        console.log("❌ FAIL\n");
        if (!correctCount) {
          console.log(`   ❌ Count mismatch: expected ${testCase.expectedDetections}, got ${detected.length}`);
        }
        if (!correctTypes) {
          console.log(`   ❌ Type mismatch: expected [${testCase.expectedTypes.join(', ')}], got [${detectedTypes.join(', ')}]`);
        }
      }
      
      // Show detected links details
      if (detected.length > 0) {
        detected.forEach((link, index) => {
          console.log(`  🔗 ${index + 1}. ${link.type}: ${link.link} (ID: ${link.id})`);
        });
        console.log();
      }
      
    } catch (error) {
      console.log(`❌ ERROR: ${error.message}\n`);
    }
  }
  
  console.log(`📊 Link Detection Results: ${passedTests}/${totalTests} tests passed`);
  return passedTests === totalTests;
}

// Test function for auto join handling
async function testAutoJoinHandling() {
  console.log("\n🤖 Testing Auto Join Handling...\n");
  
  const testLinks = [
    {
      type: "ZALO_GROUP",
      link: "https://zalo.me/g/testgroup123",
      id: "testgroup123"
    },
    {
      type: "ZALO_INVITE", 
      link: "https://zalo.me/s/invite456",
      id: "invite456"
    }
  ];
  
  try {
    console.log("Testing handleAutoJoin function...");
    
    await autoJoinModule.handleAutoJoin(
      mockAPI,
      "test_thread_123",
      1, // Group type
      "test_user_456",
      "TestUser",
      testLinks
    );
    
    console.log("✅ Auto join handling completed successfully");
    return true;
    
  } catch (error) {
    console.log(`❌ Auto join handling failed: ${error.message}`);
    return false;
  }
}

// Test function for command execution
async function testCommandExecution() {
  console.log("\n⚙️ Testing Command Execution...\n");
  
  const testCommands = [
    { args: ["status"], description: "Show status" },
    { args: ["test"], description: "Test detection" },
    { args: ["on"], description: "Enable auto join" },
    { args: ["off"], description: "Disable auto join" },
    { args: [], description: "Show help" }
  ];
  
  let passedCommands = 0;
  
  for (const cmd of testCommands) {
    try {
      console.log(`Testing command: autojoin ${cmd.args.join(' ')} (${cmd.description})`);
      
      const mockEvent = {
        threadId: "test_thread_123",
        type: 1,
        data: {
          uidFrom: "test_user_456",
          dName: "TestUser"
        }
      };
      
      await autoJoinModule.run({
        api: mockAPI,
        event: mockEvent,
        args: cmd.args,
        Threads: mockThreads
      });
      
      console.log("✅ Command executed successfully\n");
      passedCommands++;
      
    } catch (error) {
      console.log(`❌ Command failed: ${error.message}\n`);
    }
  }
  
  console.log(`📊 Command Execution Results: ${passedCommands}/${testCommands.length} commands passed`);
  return passedCommands === testCommands.length;
}

// Test data persistence
async function testDataPersistence() {
  console.log("\n💾 Testing Data Persistence...\n");
  
  try {
    // Test creating temp directory
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      console.log("✅ Created temp directory");
    }
    
    // Test file paths
    const testFiles = [
      path.join(tempDir, 'autojoin_data.json'),
      path.join(tempDir, 'autojoin_stats.json')
    ];
    
    for (const filePath of testFiles) {
      const testData = {
        test: true,
        timestamp: Date.now(),
        message: "Test data for auto join functionality"
      };
      
      fs.writeFileSync(filePath, JSON.stringify(testData, null, 2));
      console.log(`✅ Created test file: ${path.basename(filePath)}`);
      
      const readData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (readData.test === true) {
        console.log(`✅ Successfully read test file: ${path.basename(filePath)}`);
      }
    }
    
    console.log("✅ Data persistence test completed");
    return true;
    
  } catch (error) {
    console.log(`❌ Data persistence test failed: ${error.message}`);
    return false;
  }
}

// Main test runner
async function runAllTests() {
  console.log("🚀 Starting Auto Join Zalo Group Tests");
  console.log("=" .repeat(50));
  
  const results = {
    linkDetection: false,
    autoJoinHandling: false,
    commandExecution: false,
    dataPersistence: false
  };
  
  try {
    // Run all tests
    results.linkDetection = await testLinkDetection();
    results.autoJoinHandling = await testAutoJoinHandling();
    results.commandExecution = await testCommandExecution();
    results.dataPersistence = await testDataPersistence();
    
    // Summary
    console.log("\n" + "=" .repeat(50));
    console.log("📋 Test Summary:");
    console.log("=" .repeat(50));
    
    const testNames = [
      "Link Detection",
      "Auto Join Handling", 
      "Command Execution",
      "Data Persistence"
    ];
    
    const testResults = Object.values(results);
    const passedCount = testResults.filter(r => r).length;
    
    testNames.forEach((name, index) => {
      const status = testResults[index] ? "✅ PASS" : "❌ FAIL";
      console.log(`${name}: ${status}`);
    });
    
    console.log(`\n🎯 Overall Result: ${passedCount}/${testResults.length} tests passed`);
    
    if (passedCount === testResults.length) {
      console.log("🎉 All tests passed! Auto join functionality is working correctly.");
    } else {
      console.log("⚠️ Some tests failed. Please check the implementation.");
    }
    
    // Usage instructions
    console.log("\n" + "=" .repeat(50));
    console.log("📚 Usage Instructions:");
    console.log("=" .repeat(50));
    console.log("1. Enable auto join: 'autojoin on'");
    console.log("2. Disable auto join: 'autojoin off'");
    console.log("3. Check status: 'autojoin status'");
    console.log("4. View history: 'autojoin history'");
    console.log("5. View statistics: 'autojoin stats'");
    console.log("6. Test detection: 'autojoin test'");
    console.log("\n🔧 Integration with anti.js:");
    console.log("• Use 'anti autojoin' to toggle via anti command");
    console.log("• Auto join works with anti-link detection");
    console.log("• Supports cooldown and daily limits");
    
  } catch (error) {
    console.error("🚨 Test runner failed:", error.message);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  runAllTests,
  testLinkDetection,
  testAutoJoinHandling,
  testCommandExecution,
  testDataPersistence
};
