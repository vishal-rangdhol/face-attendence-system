Pod::Spec.new do |s|
  s.name           = 'FaceCamera'
  s.version        = '1.0.0'
  s.summary        = 'Continuous face detection camera module using AVFoundation and Apple Vision'
  s.description    = 'Native camera view providing real-time face tracking and single-shot capture'
  s.author         = 'LCU'
  s.homepage       = 'https://github.com/lcu/face-attendance'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.4'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
  s.frameworks = 'AVFoundation', 'Vision', 'CoreMedia', 'UIKit'
end
