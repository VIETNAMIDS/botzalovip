module.exports.config = {
  name: "bonzQuizAnswer",
  eventType: ["log:message"],
  version: "1.0.0",
  credits: "Zeid Bot",
  description: "Xử lý câu trả lời cho Bonz Quiz và Multiple Choice"
};

module.exports.run = async function({ api, event }) {
  const { threadID, messageID, body, senderID } = event;
  
  if (!body || body.length > 100) return; // Ignore quá dài
  
  const message = body.toLowerCase().trim();
  const userId = senderID;
  const threadId = threadID;
  
  // Xử lý câu trả lời Quiz (câu đố kiến thức)
  const quizKey = `${threadId}_${userId}`;
  if (global.bonzQuizData && global.bonzQuizData[quizKey]) {
    const currentQuiz = global.bonzQuizData[quizKey];
    
    if (!currentQuiz.answered) {
      currentQuiz.answered = true;
      
      const userStats = global.bonzQuizStats[userId];
      const correctAnswer = currentQuiz.question.answer.toLowerCase();
      const timeTaken = Math.round((Date.now() - currentQuiz.startTime) / 1000);
      
      // Kiểm tra đáp án
      const isCorrect = message === correctAnswer || 
                       message.includes(correctAnswer) || 
                       correctAnswer.includes(message);
      
      let resultMsg = [];
      let points = 0;
      
      if (isCorrect) {
        userStats.correct++;
        userStats.streak++;
        userStats.totalQuiz++;
        
        if (userStats.streak > userStats.bestStreak) {
          userStats.bestStreak = userStats.streak;
        }
        
        // Tính điểm
        let basePoints = 10;
        const difficultyMultiplier = {
          'Dễ': 1,
          'Trung bình': 1.5,
          'Khó': 2
        };
        
        points = Math.round(basePoints * (difficultyMultiplier[currentQuiz.question.difficulty] || 1));
        points += userStats.streak; // Streak bonus
        
        // Speed bonus
        if (timeTaken <= 10) {
          points += 5;
          resultMsg.push('⚡ Speed Bonus: +5 điểm!');
        }
        
        resultMsg.unshift(`✅ CHÍNH XÁC! (+${points} điểm)`);
        resultMsg.push('');
        resultMsg.push(`🎯 Đáp án: **${currentQuiz.question.answer}**`);
        resultMsg.push(`⏱️ Thời gian: ${timeTaken}s`);
        resultMsg.push(`🔥 Streak: ${userStats.streak} (Tốt nhất: ${userStats.bestStreak})`);
        resultMsg.push(`📊 Tỉ lệ đúng: ${Math.round((userStats.correct / userStats.totalQuiz) * 100)}%`);
        
        if (userStats.streak >= 5) {
          resultMsg.push('🔥 STREAK XUẤT SẮC! Bạn đang rất tốt!');
        }
        
      } else {
        userStats.wrong++;
        userStats.totalQuiz++;
        userStats.streak = 0;
        points = -2;
        
        resultMsg.push(`❌ SAI RỒI! (${points} điểm)`);
        resultMsg.push('');
        resultMsg.push(`🔍 Đáp án đúng: **${currentQuiz.question.answer}**`);
        resultMsg.push(`💭 Bạn trả lời: "${body}"`);
        resultMsg.push(`⏱️ Thời gian: ${timeTaken}s`);
        resultMsg.push(`📊 Streak bị reset về 0`);
        resultMsg.push(`🎯 Tỉ lệ đúng: ${Math.round((userStats.correct / userStats.totalQuiz) * 100)}%`);
      }
      
      // Cập nhật điểm vào hệ thống tổng
      if (!global.bonzQuizStats) global.bonzQuizStats = {};
      if (!global.bonzQuizStats[userId]) global.bonzQuizStats[userId] = userStats;
      
      resultMsg.push('');
      resultMsg.push('🎮 Gõ "bonz câu đố start" để chơi tiếp!');
      resultMsg.push('📊 Gõ "bonz điểm" để xem tổng điểm!');
      
      // Xóa quiz hiện tại
      delete global.bonzQuizData[quizKey];
      
      return api.sendMessage(resultMsg.join('\n'), threadId);
    }
  }
  
  // Xử lý câu trả lời Multiple Choice (trắc nghiệm)
  if (global.bonzMultipleChoiceData && global.bonzMultipleChoiceData[quizKey]) {
    const currentQuiz = global.bonzMultipleChoiceData[quizKey];
    
    if (!currentQuiz.answered && ['a', 'b', 'c', 'd'].includes(message)) {
      currentQuiz.answered = true;
      
      const userStats = global.bonzMultipleChoiceStats[userId];
      const correctAnswer = currentQuiz.question.correct.toLowerCase();
      const timeTaken = Math.round((Date.now() - currentQuiz.startTime) / 1000);
      
      let resultMsg = [];
      let points = 0;
      
      if (message === correctAnswer) {
        userStats.correct++;
        userStats.streak++;
        userStats.totalQuiz++;
        
        if (userStats.streak > userStats.bestStreak) {
          userStats.bestStreak = userStats.streak;
        }
        
        if (timeTaken < userStats.fastestTime) {
          userStats.fastestTime = timeTaken;
        }
        
        // Tính điểm
        let basePoints = 15;
        const difficultyMultiplier = {
          'Dễ': 1,
          'Trung bình': 1.5,
          'Khó': 2
        };
        
        points = Math.round(basePoints * (difficultyMultiplier[currentQuiz.question.difficulty] || 1));
        points += userStats.streak * 2; // Streak bonus x2
        
        // Speed bonus
        if (timeTaken <= 10) {
          points += 5;
          resultMsg.push('⚡ Speed Bonus: +5 điểm!');
        }
        
        resultMsg.unshift(`✅ CHÍNH XÁC! (+${points} điểm)`);
        resultMsg.push('');
        
        const correctOption = currentQuiz.question.options.find(opt => 
          opt.toLowerCase().startsWith(correctAnswer)
        );
        resultMsg.push(`🎯 Đáp án đúng: **${correctOption}**`);
        resultMsg.push(`⏱️ Thời gian: ${timeTaken}s`);
        resultMsg.push(`🔥 Streak: ${userStats.streak} (Tốt nhất: ${userStats.bestStreak})`);
        resultMsg.push(`📊 Tỉ lệ đúng: ${Math.round((userStats.correct / userStats.totalQuiz) * 100)}%`);
        
        if (timeTaken === userStats.fastestTime) {
          resultMsg.push('🏃‍♂️ KỶ LỤC MỚI! Thời gian nhanh nhất của bạn!');
        }
        
        if (userStats.streak >= 5) {
          resultMsg.push('🔥 STREAK XUẤT SẮC! Bạn đang rất tốt!');
        }
        
      } else {
        userStats.wrong++;
        userStats.totalQuiz++;
        userStats.streak = 0;
        points = -3;
        
        resultMsg.push(`❌ SAI RỒI! (${points} điểm)`);
        resultMsg.push('');
        
        const correctOption = currentQuiz.question.options.find(opt => 
          opt.toLowerCase().startsWith(correctAnswer)
        );
        const userOption = currentQuiz.question.options.find(opt => 
          opt.toLowerCase().startsWith(message)
        );
        
        resultMsg.push(`🔍 Đáp án đúng: **${correctOption}**`);
        resultMsg.push(`💭 Bạn chọn: **${userOption}**`);
        resultMsg.push(`⏱️ Thời gian: ${timeTaken}s`);
        resultMsg.push(`📊 Streak bị reset về 0`);
        resultMsg.push(`🎯 Tỉ lệ đúng: ${Math.round((userStats.correct / userStats.totalQuiz) * 100)}%`);
      }
      
      // Cập nhật điểm vào hệ thống tổng
      if (!global.bonzMultipleChoiceStats) global.bonzMultipleChoiceStats = {};
      if (!global.bonzMultipleChoiceStats[userId]) global.bonzMultipleChoiceStats[userId] = userStats;
      
      resultMsg.push('');
      resultMsg.push('🎮 Gõ "bonz trắc start" để chơi tiếp!');
      resultMsg.push('📊 Gõ "bonz điểm" để xem tổng điểm!');
      
      // Xóa quiz hiện tại
      delete global.bonzMultipleChoiceData[quizKey];
      
      return api.sendMessage(resultMsg.join('\n'), threadId);
    }
  }
};
