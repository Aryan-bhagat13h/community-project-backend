import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { User } from '../src/models/user.models.js';
import { Profile } from '../src/models/profile.models.js';
import { AdminProfile } from '../src/models/admin-profile.models.js';
import { Problem } from '../src/models/problem.models.js';

vi.mock('../src/utils/cloudinary.js', () => ({
  uploadOnCloudinary: vi.fn().mockResolvedValue({
    secure_url: 'https://res.cloudinary.com/demo/image/upload/v12345/test.jpg',
    url: 'http://res.cloudinary.com/demo/image/upload/v12345/test.jpg',
  }),
}));

describe('Community Project Backend API Integration Tests', () => {

  describe('User Authentication Routes (/api/v1/users)', () => {
    it('should register a new user successfully', async () => {
      const res = await request(app)
        .post('/api/v1/users/register')
        .send({
          fullname: 'Student User',
          email: 'student@example.com',
          username: 'student123',
          password: 'password123',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.username).toBe('student123');
      expect(res.body.data.email).toBe('student@example.com');
    });

    it('should login an existing user and return cookies', async () => {
      await request(app)
        .post('/api/v1/users/register')
        .send({
          fullname: 'Student User',
          email: 'student@example.com',
          username: 'student123',
          password: 'password123',
        });

      const loginRes = await request(app)
        .post('/api/v1/users/login')
        .send({
          email: 'student@example.com',
          password: 'password123',
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.success).toBe(true);
      expect(loginRes.headers['set-cookie']).toBeDefined();
    });

    it('should reject invalid credentials during login', async () => {
      const loginRes = await request(app)
        .post('/api/v1/users/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'wrongpassword',
        });

      expect(loginRes.status).toBe(401);
      expect(loginRes.body.success).toBe(false);
    });
  });

  describe('Profile Routes (/api/v1/profile)', () => {
    let authCookie = [];

    beforeEach(async () => {
      await request(app)
        .post('/api/v1/users/register')
        .send({
          fullname: 'Jane Doe',
          email: 'jane@example.com',
          username: 'janedoe',
          password: 'password123',
        });

      const loginRes = await request(app)
        .post('/api/v1/users/login')
        .send({ email: 'jane@example.com', password: 'password123' });

      authCookie = loginRes.headers['set-cookie'];
    });

    it('should create a base profile', async () => {
      const res = await request(app)
        .post('/api/v1/profile')
        .set('Cookie', authCookie)
        .field('phone', '+1234567890')
        .field('bio', 'Software Engineering student')
        .attach('profilePhoto', Buffer.from('fake image'), 'test.jpg');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.phone).toBe('+1234567890');
      expect(res.body.data.bio).toBe('Software Engineering student');
    });

    it('should fetch the profile using GET /me', async () => {
      await request(app)
        .post('/api/v1/profile')
        .set('Cookie', authCookie)
        .field('phone', '+1234567890')
        .attach('profilePhoto', Buffer.from('fake image'), 'test.jpg');

      const res = await request(app)
        .get('/api/v1/profile/me')
        .set('Cookie', authCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.phone).toBe('+1234567890');
    });

    it('should update the profile using PATCH /me', async () => {
      await request(app)
        .post('/api/v1/profile')
        .set('Cookie', authCookie)
        .field('phone', '+1234567890')
        .attach('profilePhoto', Buffer.from('fake image'), 'test.jpg');

      const updateRes = await request(app)
        .patch('/api/v1/profile/me')
        .set('Cookie', authCookie)
        .send({ bio: 'Updated Bio' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.bio).toBe('Updated Bio');
    });
  });

  describe('Student Profile Routes (/api/v1/students)', () => {
    let authCookie = [];

    beforeEach(async () => {
      await User.create({
        fullname: 'Student Alpha',
        email: 'studenta@example.com',
        username: 'studenta',
        password: 'password123',
        role: 'student',
      });

      const loginRes = await request(app)
        .post('/api/v1/users/login')
        .send({ email: 'studenta@example.com', password: 'password123' });

      authCookie = loginRes.headers['set-cookie'];

      await request(app)
        .post('/api/v1/profile')
        .set('Cookie', authCookie)
        .field('phone', '+1234567890')
        .attach('profilePhoto', Buffer.from('fake image'), 'test.jpg');
    });

    it('should create and update a student profile', async () => {
      const createRes = await request(app)
        .post('/api/v1/students')
        .set('Cookie', authCookie)
        .send({
          college: 'Tech University',
          department: 'Computer Science',
          degree: 'B.Tech',
          currentYear: 3,
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.college).toBe('Tech University');

      const updateRes = await request(app)
        .patch('/api/v1/students/me')
        .set('Cookie', authCookie)
        .send({
          college: 'State University',
          skills: [{ name: 'JavaScript', level: 'advanced' }],
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.college).toBe('State University');
      expect(updateRes.body.data.skills[0].name).toBe('JavaScript');
    });
  });

  describe('Faculty Profile Routes (/api/v1/faculty)', () => {
    let authCookie = [];

    beforeEach(async () => {
      await User.create({
        fullname: 'Dr. Smith',
        email: 'faculty@example.com',
        username: 'drsmith',
        password: 'password123',
        role: 'faculty',
      });

      const loginRes = await request(app)
        .post('/api/v1/users/login')
        .send({ email: 'faculty@example.com', password: 'password123' });

      authCookie = loginRes.headers['set-cookie'];

      await request(app)
        .post('/api/v1/profile')
        .set('Cookie', authCookie)
        .field('phone', '+1234567890')
        .attach('profilePhoto', Buffer.from('fake image'), 'test.jpg');
    });

    it('should create and update a faculty profile', async () => {
      const createRes = await request(app)
        .post('/api/v1/faculty')
        .set('Cookie', authCookie)
        .send({
          institution: 'MIT',
          department: 'Computer Science',
          qualifications: ['Ph.D.'],
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.institution).toBe('MIT');

      const updateRes = await request(app)
        .patch('/api/v1/faculty/me')
        .set('Cookie', authCookie)
        .send({
          expertise: ['AI', 'Machine Learning'],
          experience: 10,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.experience).toBe(10);
      expect(updateRes.body.data.expertise).toEqual(['AI', 'Machine Learning']);
    });
  });

  describe('Reporter Profile Routes (/api/v1/reporters)', () => {
    let authCookie = [];

    beforeEach(async () => {
      await User.create({
        fullname: 'Reporter One',
        email: 'reporter@example.com',
        username: 'reporter1',
        password: 'password123',
        role: 'reporter',
      });

      const loginRes = await request(app)
        .post('/api/v1/users/login')
        .send({ email: 'reporter@example.com', password: 'password123' });

      authCookie = loginRes.headers['set-cookie'];

      await request(app)
        .post('/api/v1/profile')
        .set('Cookie', authCookie)
        .field('phone', '+1234567890')
        .attach('profilePhoto', Buffer.from('fake image'), 'test.jpg');
    });

    it('should create and update a reporter profile', async () => {
      const createRes = await request(app)
        .post('/api/v1/reporters')
        .set('Cookie', authCookie)
        .send({
          reporterType: 'ngo',
          organizationName: 'Eco Save NGO',
          contactPerson: 'Reporter One',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.organizationName).toBe('Eco Save NGO');

      const updateRes = await request(app)
        .patch('/api/v1/reporters/me')
        .set('Cookie', authCookie)
        .send({
          description: 'Working on community environmental challenges',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.description).toBe('Working on community environmental challenges');
    });
  });

  describe('Admin Profile Routes (/api/v1/admin)', () => {
    let superAdminCookie = [];
    let superAdminUser = null;
    let targetUser = null;

    beforeEach(async () => {
      superAdminUser = await User.create({
        fullname: 'Super Admin',
        email: 'superadmin@example.com',
        username: 'superadmin',
        password: 'password123',
        role: 'admin',
      });

      const superLogin = await request(app)
        .post('/api/v1/users/login')
        .send({ email: 'superadmin@example.com', password: 'password123' });

      superAdminCookie = superLogin.headers['set-cookie'];

      const superBaseProfile = await Profile.create({
        user: superAdminUser._id,
        name: 'Super Admin',
        phone: '+1111111111',
      });

      const superAdminProfileObj = await AdminProfile.create({
        adminType: 'super_admin',
        department: 'Governance',
      });

      superBaseProfile.roleProfile = superAdminProfileObj._id;
      superBaseProfile.roleProfileModel = 'AdminProfile';
      await superBaseProfile.save();

      targetUser = await User.create({
        fullname: 'Target Admin',
        email: 'targetadmin@example.com',
        username: 'targetadmin',
        password: 'password123',
        role: 'admin',
      });

      await Profile.create({
        user: targetUser._id,
        name: 'Target Admin',
        phone: '+2222222222',
      });
    });

    it('should allow super admin to create an admin profile for another user', async () => {
      const res = await request(app)
        .post('/api/v1/admin')
        .set('Cookie', superAdminCookie)
        .send({
          userId: String(targetUser._id),
          adminType: 'moderator',
          department: 'Public Affairs',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.adminType).toBe('moderator');
      expect(res.body.data.department).toBe('Public Affairs');
    });

    it('should allow super admin to change admin type of another admin', async () => {
      await request(app)
        .post('/api/v1/admin')
        .set('Cookie', superAdminCookie)
        .send({
          userId: String(targetUser._id),
          adminType: 'moderator',
        });

      const patchRes = await request(app)
        .patch(`/api/v1/admin/${targetUser._id}/type`)
        .set('Cookie', superAdminCookie)
        .send({ adminType: 'project_admin' });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.adminType).toBe('project_admin');
    });
  });

  describe('Problem Routes (/api/v1/problems)', () => {
    let authCookie = [];

    beforeEach(async () => {
      await User.create({
        fullname: 'Problem Reporter',
        email: 'problemreporter@example.com',
        username: 'problemreporter',
        password: 'password123',
        role: 'student',
      });

      const loginRes = await request(app)
        .post('/api/v1/users/login')
        .send({ email: 'problemreporter@example.com', password: 'password123' });

      authCookie = loginRes.headers['set-cookie'];
    });

    it('should register a new problem successfully', async () => {
      const res = await request(app)
        .post('/api/v1/problems')
        .set('Cookie', authCookie)
        .field('title', 'Water Supply Leakage')
        .field('description', JSON.stringify(['Main pipeline burst near sector 5']))
        .field('category', 'water')
        .field('problemType', 'infrastructure')
        .field('preferredCommunication', 'email')
        .field('locationType', 'locality')
        .field('isPopulationAffected', 'true')
        .field('approxNoPeopleAffected', '250')
        .field('hasAffectedGroups', 'true')
        .field('affectedGroups', JSON.stringify(['local_residents']))
        .field('coordinates', JSON.stringify([77.2090, 28.6139]))
        .attach('problemPhoto', Buffer.from('fake image data'), 'problem.jpg');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Water Supply Leakage');
      expect(res.body.data.category).toBe('water');
    });

    it('should track a problem by ID', async () => {
      const createRes = await request(app)
        .post('/api/v1/problems')
        .set('Cookie', authCookie)
        .field('title', 'Track Test Problem')
        .field('description', JSON.stringify(['Description to track']))
        .field('category', 'education')
        .field('problemType', 'educational')
        .field('preferredCommunication', 'email')
        .field('locationType', 'village')
        .field('isPopulationAffected', 'false')
        .field('hasAffectedGroups', 'false')
        .field('coordinates', JSON.stringify([77.2, 28.6]))
        .attach('problemPhoto', Buffer.from('fake image data'), 'problem.jpg');

      const problemId = createRes.body.data._id;

      const trackRes = await request(app)
        .get(`/api/v1/problems/${problemId}`)
        .set('Cookie', authCookie);

      expect(trackRes.status).toBe(200);
      expect(trackRes.body.data.title).toBe('Track Test Problem');
    });

    it('should update and soft-delete a problem', async () => {
      const createRes = await request(app)
        .post('/api/v1/problems')
        .set('Cookie', authCookie)
        .field('title', 'Edit Test Problem')
        .field('description', JSON.stringify(['Original description']))
        .field('category', 'healthcare')
        .field('problemType', 'social')
        .field('preferredCommunication', 'email')
        .field('locationType', 'city')
        .field('isPopulationAffected', 'false')
        .field('hasAffectedGroups', 'false')
        .field('coordinates', JSON.stringify([77.2, 28.6]))
        .attach('problemPhoto', Buffer.from('fake image data'), 'problem.jpg');

      const problemId = createRes.body.data._id;

      const updateRes = await request(app)
        .patch(`/api/v1/problems/${problemId}`)
        .set('Cookie', authCookie)
        .send({ title: 'Updated Title Problem' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.title).toBe('Updated Title Problem');

      const deleteRes = await request(app)
        .delete(`/api/v1/problems/${problemId}`)
        .set('Cookie', authCookie)
        .send({ deleteReason: 'No longer relevant' });

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.data.isDeleted).toBe(true);
    });
  });

  describe('Team Routes (/api/v1/teams)', () => {
    let leaderCookie = [];

    beforeEach(async () => {
      await User.create({
        fullname: 'Team Leader',
        email: 'leader@example.com',
        username: 'leader1',
        password: 'password123',
        role: 'student',
      });

      const loginRes = await request(app)
        .post('/api/v1/users/login')
        .send({ email: 'leader@example.com', password: 'password123' });

      leaderCookie = loginRes.headers['set-cookie'];
    });

    it('should create a team successfully', async () => {
      const res = await request(app)
        .post('/api/v1/teams')
        .set('Cookie', leaderCookie)
        .send({
          name: 'Innovation Squad',
          description: 'Working on community solutions',
          maxMembers: 5,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Innovation Squad');
    });
  });

  describe('Student Problem Browsing & Saving (/api/v1/students/problems)', () => {
    let studentCookie = [];
    let testProblem = null;

    beforeEach(async () => {
      const student = await User.create({
        fullname: 'Student Browser',
        email: 'browser@example.com',
        username: 'browser1',
        password: 'password123',
        role: 'student',
      });

      const loginRes = await request(app)
        .post('/api/v1/users/login')
        .send({ email: 'browser@example.com', password: 'password123' });

      studentCookie = loginRes.headers['set-cookie'];

      testProblem = await Problem.create({
        title: 'Road Potholes',
        description: ['Large potholes on main street'],
        category: 'infrastructure',
        problemType: 'infrastructure',
        preferredCommunication: 'email',
        location: { type: 'Point', coordinates: [77.2, 28.6] },
        locationType: 'locality',
        isPopulationAffected: true,
        approxNoPeopleAffected: 100,
        hasAffectedGroups: false,
        problemPhoto: 'http://example.com/photo.jpg',
        verificationStatus: 'verified',
        reportedBy: student._id,
      });
    });

    it('should browse verified problems', async () => {
      const res = await request(app)
        .get('/api/v1/students/problems')
        .set('Cookie', studentCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.problems.length).toBeGreaterThan(0);
    });

    it('should save and unsave a problem', async () => {
      const saveRes = await request(app)
        .post(`/api/v1/students/problems/${testProblem._id}/save`)
        .set('Cookie', studentCookie);

      expect(saveRes.status).toBe(200);

      const getSavedRes = await request(app)
        .get('/api/v1/students/problems/saved')
        .set('Cookie', studentCookie);

      expect(getSavedRes.status).toBe(200);
      expect(getSavedRes.body.data.problems.length).toBe(1);

      const unsaveRes = await request(app)
        .delete(`/api/v1/students/problems/${testProblem._id}/save`)
        .set('Cookie', studentCookie);

      expect(unsaveRes.status).toBe(200);
    });
  });

  describe('Admin Problem Moderation (/api/v1/admin/problems)', () => {
    let adminCookie = [];
    let testProblem = null;

    beforeEach(async () => {
      const adminUser = await User.create({
        fullname: 'Moderator Admin',
        email: 'modadmin@example.com',
        username: 'modadmin',
        password: 'password123',
        role: 'admin',
      });

      const loginRes = await request(app)
        .post('/api/v1/users/login')
        .send({ email: 'modadmin@example.com', password: 'password123' });

      adminCookie = loginRes.headers['set-cookie'];

      testProblem = await Problem.create({
        title: 'Unverified Issue',
        description: ['Pending verification problem'],
        category: 'healthcare',
        problemType: 'health',
        preferredCommunication: 'email',
        location: { type: 'Point', coordinates: [77.2, 28.6] },
        locationType: 'city',
        isPopulationAffected: true,
        approxNoPeopleAffected: 50,
        hasAffectedGroups: false,
        problemPhoto: 'http://example.com/photo.jpg',
        verificationStatus: 'pending',
        reportedBy: adminUser._id,
      });
    });

    it('should update verification status of a problem', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/problems/${testProblem._id}/status`)
        .set('Cookie', adminCookie)
        .send({ verificationStatus: 'verified' });

      expect(res.status).toBe(200);
      expect(res.body.data.verificationStatus).toBe('verified');
    });

    it('should set severity and urgency of a problem', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/problems/${testProblem._id}/severity-urgency`)
        .set('Cookie', adminCookie)
        .send({ severity: 'high', urgency: 'urgent' });

      expect(res.status).toBe(200);
      expect(res.body.data.severity).toBe('high');
      expect(res.body.data.urgency).toBe('urgent');
    });
  });

});
